import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';


const NUM_PARTICLES = 500;
const H = 0.1;
const REST_DENSITY = 1000;
const EPSILON = 100;
const DT = 0.016;
const ITER = 3;


const BOTTLE_RADIUS = 0.3;
const BOTTLE_HEIGHT = 1.2;
const BOTTLE_CENTER = new THREE.Vector3(0, 0, 0);


const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0, 0.5, 2);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);


const bottleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2
});

const bottleMesh = new THREE.Mesh(bottleGeo, bottleMat);
bottleMesh.position.y = BOTTLE_HEIGHT / 2;
scene.add(bottleMesh);


let particles = [];

for(let i=0;i<NUM_PARTICLES;i++){
    particles.push({
        pos: new THREE.Vector3(
            (Math.random()-0.5)*0.5,
            Math.random()*0.5,
            (Math.random()-0.5)*0.5
        ),
        vel: new THREE.Vector3(),
        lambda: 0,
        deltaP: new THREE.Vector3()
    });
}


const geo = new THREE.BufferGeometry();

const positions = new Float32Array(NUM_PARTICLES * 3);
const colors = new Float32Array(NUM_PARTICLES * 3);

geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const mat = new THREE.PointsMaterial({
    size: 0.02,
    vertexColors: true
});

const points = new THREE.Points(geo, mat);
scene.add(points);



function poly6(r){
    let r2 = r.lengthSq();
    if(r2 > H*H) return 0;
    return 315/(64*Math.PI*Math.pow(H,9)) * Math.pow(H*H - r2, 3);
}

function spikyGrad(r){
    let l = r.length();
    if(l === 0 || l > H) return new THREE.Vector3();
    let coef = -45/(Math.PI*Math.pow(H,6)) * Math.pow(H - l, 2);
    return r.clone().normalize().multiplyScalar(coef);
}



function neighbors(i){
    let list = [];
    for(let j=0;j<NUM_PARTICLES;j++){
        if(i === j) continue;
        if(particles[i].pos.distanceTo(particles[j].pos) < H){
            list.push(j);
        }
    }
    return list;
}

function respawnParticle(p){
    // 上部のランダム位置
    let angle = Math.random() * Math.PI * 2;
    let r = Math.random() * BOTTLE_RADIUS * 0.8;

    p.pos.set(
        Math.cos(angle) * r,
        BOTTLE_HEIGHT,
        Math.sin(angle) * r
    );

    // 下向き＋少しランダム
    p.vel.set(
        (Math.random()-0.5)*0.5,
        -2 - Math.random()*2,
        (Math.random()-0.5)*0.5
    );
}

function solveBottleCollision(p){

    // XZ平面で中心からの距離
    let dx = p.pos.x - BOTTLE_CENTER.x;
    let dz = p.pos.z - BOTTLE_CENTER.z;

    let dist = Math.sqrt(dx*dx + dz*dz);

    // 側面（円柱）
    if(dist > BOTTLE_RADIUS){
        let nx = dx / dist;
        let nz = dz / dist;

        // 押し戻す
        p.pos.x = BOTTLE_CENTER.x + nx * BOTTLE_RADIUS;
        p.pos.z = BOTTLE_CENTER.z + nz * BOTTLE_RADIUS;

        // 反射
        let vn = p.vel.x * nx + p.vel.z * nz;
        p.vel.x -= 1.5 * vn * nx;
        p.vel.z -= 1.5 * vn * nz;
    }

    // 底
    if(p.pos.y < 0){
        p.pos.y = 0;
        p.vel.y *= -0.3;
    }

    // 上（開口）
    if(p.pos.y > BOTTLE_HEIGHT + 0.2){
        respawnParticle(p);
    }
}


function step(){

    // 重力
    for(let p of particles){
        p.vel.y -= 9.8 * DT;
        p.pos.add(p.vel.clone().multiplyScalar(DT));
    
    if(p.pos.y < -0.2){
	repawnParticle(p);
    }
    }

    for(let k=0;k<ITER;k++){

        // λ
        for(let i=0;i<NUM_PARTICLES;i++){
            let pi = particles[i];
            let neigh = neighbors(i);

            let density = 0;
            for(let j of neigh){
                density += poly6(pi.pos.clone().sub(particles[j].pos));
            }

            let Ci = density / REST_DENSITY - 1;

            let gradSum = 0;
            let grad_i = new THREE.Vector3();

            for(let j of neigh){
                let grad = spikyGrad(pi.pos.clone().sub(particles[j].pos));
                gradSum += grad.lengthSq();
                grad_i.add(grad);
            }

            gradSum += grad_i.lengthSq();

            pi.lambda = -Ci / (gradSum + EPSILON);
        }

        // Δp
        for(let i=0;i<NUM_PARTICLES;i++){
            let pi = particles[i];
            let neigh = neighbors(i);

            let dp = new THREE.Vector3();

            for(let j of neigh){
                let pj = particles[j];

                let grad = spikyGrad(pi.pos.clone().sub(pj.pos));
                let scorr = -0.001 * Math.pow(
                    poly6(pi.pos.clone().sub(pj.pos)) /
                    poly6(new THREE.Vector3(0.01,0,0)),
                    4
                );

                dp.add(grad.multiplyScalar(pi.lambda + pj.lambda + scorr));
            }

            pi.deltaP = dp.multiplyScalar(1/REST_DENSITY);
        }

        // 位置更新
        for(let p of particles){
            p.pos.add(p.deltaP);

	    solveBottleCollision(p);

            if(p.pos.y < 0){
                p.pos.y = 0;
                p.vel.y *= -0.3;
            }
        }
    }

    // 速度更新
    for(let p of particles){
        let newVel = p.deltaP.clone().divideScalar(DT);
        p.vel.add(newVel);
    }
}



function animate(){
    requestAnimationFrame(animate);

    step();

    for(let i=0;i<NUM_PARTICLES;i++){
        let p = particles[i];

        // 位置
        positions[i*3+0] = p.pos.x;
        positions[i*3+1] = p.pos.y;
        positions[i*3+2] = p.pos.z;

        // グラデーション
        let t = Math.min(Math.max(p.pos.y, 0), 1);

        let r = 0.0;
        let g = 0.3 + 0.7*t;
        let b = 0.8 + 0.2*t;

        // 境界
        if(p.pos.y < 0.02){
            r = 1.0;
            g = 0.2;
            b = 0.2;
        }

        colors[i*3+0] = r;
        colors[i*3+1] = g;
        colors[i*3+2] = b;
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    renderer.render(scene, camera);
}

animate();
