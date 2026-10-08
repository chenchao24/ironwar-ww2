// 连通分量分析 Object_13/15 外层轮盘的真实布局
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
function mulVec(m,v){return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];}
function worldMat(nd){const p=nd.listParents().filter(p=>p.propertyType==='Node');const m=nd.getMatrix();if(!p.length)return m;const pm=worldMat(p[0]);const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=pm[k*4+r]*m[c*4+k];return o;}
(async()=>{
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read('tankModel/pz.kpfw._vi.glb');
const tris=[];
for(const node of doc.getRoot().listNodes()){
  if(!node.getMesh())continue;
  const nm=node.getName();
  if(nm!=='Object_13'&&nm!=='Object_15')continue;
  const wm=worldMat(node);
  for(const prim of node.getMesh().listPrimitives()){
    const pos=prim.getAttribute('POSITION').getArray();
    const idx=prim.getIndices()?prim.getIndices().getArray():null;
    const n=(idx?idx.length:pos.length/3)/3;
    for(let t=0;t<n;t++){
      const wv=[],c=[0,0,0];
      for(let k=0;k<3;k++){
        const v=idx?idx[t*3+k]:t*3+k;
        const p=mulVec(wm,[pos[v*3],pos[v*3+1],pos[v*3+2]]);
        wv.push(p);c[0]+=p[0]/3;c[1]+=p[1]/3;c[2]+=p[2]/3;
      }
      // 只看轮带外侧层（|x|>1.25，y<1.4），即各排轮盘
      if(c[1]>1.4||Math.abs(c[0])<1.25)continue;
      tris.push({wv,c});
    }
  }
}
console.log('外层三角面:',tris.length);
// 连通分量（共享顶点）
const v2t=new Map();
const keyOf=p=>`${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
tris.forEach((t,i)=>{for(const p of t.wv){const k=keyOf(p);if(!v2t.has(k))v2t.set(k,[]);v2t.get(k).push(i);}});
const comp=new Array(tris.length).fill(-1);
let nc=0;
for(let i=0;i<tris.length;i++){
  if(comp[i]>=0)continue;
  const q=[i];comp[i]=nc;
  while(q.length){
    const a=q.pop();
    for(const p of tris[a].wv)for(const j of v2t.get(keyOf(p))||[]){
      if(comp[j]<0){comp[j]=nc;q.push(j);}
    }
  }
  nc++;
}
// 汇总大分量
const groups=new Map();
for(let i=0;i<tris.length;i++){
  if(!groups.has(comp[i]))groups.set(comp[i],[]);
  groups.get(comp[i]).push(i);
}
const big=[...groups.values()].filter(g=>g.length>30).sort((a,b)=>b.length-a.length);
console.log('大分量(>30面):',big.length,'（总分量',groups.size,'）');
for(const g of big){
  let xs=[1e9,-1e9],ys=[1e9,-1e9],zs=[1e9,-1e9];
  for(const i of g)for(const p of tris[i].wv){
    xs=[Math.min(xs[0],p[0]),Math.max(xs[1],p[0])];
    ys=[Math.min(ys[0],p[1]),Math.max(ys[1],p[1])];
    zs=[Math.min(zs[0],p[2]),Math.max(zs[1],p[2])];
  }
  const zc=(zs[0]+zs[1])/2, yc=(ys[0]+ys[1])/2;
  console.log(`  n=${String(g.length).padStart(4)} x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}] 中心(z=${zc.toFixed(2)},y=${yc.toFixed(2)}) 直径z=${(zs[1]-zs[0]).toFixed(2)}`);
}
})();