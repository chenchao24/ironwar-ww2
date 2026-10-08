// 分析虎王轮系：每个轮位的轮圈顶点 x 分布（判断内/外排交错规律）+ Object_11 结构
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
function mulVec(m,v){return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];}
function worldMat(nd){const p=nd.listParents().filter(p=>p.propertyType==='Node');const m=nd.getMatrix();if(!p.length)return m;const pm=worldMat(p[0]);const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=pm[k*4+r]*m[c*4+k];return o;}
(async()=>{
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read('tankModel/pz.kpfw._vi.glb');
const root=doc.getRoot();
// 轮心（split 脚本标定值）
const wheels=[];for(let k=0;k<9;k++)wheels.push({id:k+1,z:-1.955+0.544*k,y:0.45,r:0.42});
// 收集 Object_13/15 顶点
const verts=[];
for(const node of root.listNodes()){
  if(!node.getMesh())continue;
  const nm=node.getName();
  if(nm!=='Object_13'&&nm!=='Object_15')continue;
  const wm=worldMat(node);
  for(const prim of node.getMesh().listPrimitives()){
    const arr=prim.getAttribute('POSITION').getArray();
    for(let i=0;i<arr.length;i+=3)verts.push(mulVec(wm,[arr[i],arr[i+1],arr[i+2]]));
  }
}
console.log('── 各轮位轮圈带(r 0.25~0.40)顶点 x 直方图（0.9~1.9，步长0.1）──');
for(const w of wheels){
  const hist=new Array(10).fill(0);
  for(const p of verts){
    const d=Math.hypot(p[2]-w.z,p[1]-w.y);
    if(d<0.25||d>0.40)continue;
    const b=Math.min(9,Math.max(0,Math.floor((Math.abs(p[0])-0.9)/0.1)));
    hist[b]++;
  }
  // 找主峰
  let pk=0;for(let i=1;i<10;i++)if(hist[i]>hist[pk])pk=i;
  console.log(`轮${w.id} z=${w.z.toFixed(2)}: ${hist.map((h,i)=>`${(0.95+i*0.1).toFixed(2)}:${h}`).join(' ')}  → 主峰 x≈${(0.95+pk*0.1).toFixed(2)}`);
}
// Object_11 结构：顶点 y/z 分布
console.log('\n── Object_11 顶点分布 ──');
const n11=root.listNodes().find(n=>n.getName()==='Object_11');
if(!n11){console.log('Object_11 不存在');}
else{
  const wm=worldMat(n11);
  const pts=[];
  for(const prim of n11.getMesh().listPrimitives()){
    const arr=prim.getAttribute('POSITION').getArray();
    for(let i=0;i<arr.length;i+=3)pts.push(mulVec(wm,[arr[i],arr[i+1],arr[i+2]]));
  }
  let xs=[1e9,-1e9],ys=[1e9,-1e9],zs=[1e9,-1e9];
  for(const p of pts){xs=[Math.min(xs[0],p[0]),Math.max(xs[1],p[0])];ys=[Math.min(ys[0],p[1]),Math.max(ys[1],p[1])];zs=[Math.min(zs[0],p[2]),Math.max(zs[1],p[2])];}
  console.log(`顶点数 ${pts.length}, bbox x[${xs.map(v=>v.toFixed(2))}] y[${ys.map(v=>v.toFixed(2))}] z[${zs.map(v=>v.toFixed(2))}]`);
  // y 直方图
  const h={};for(const p of pts){const b=(Math.round(p[1]*10)/10).toFixed(1);h[b]=(h[b]||0)+1;}
  console.log('y 分布:',Object.entries(h).sort((a,b)=>+a[0]-+b[0]).map(([k,v])=>`${k}:${v}`).join(' '));
  // z 直方图
  const hz={};for(const p of pts){const b=(Math.round(p[2]*2)/2).toFixed(1);hz[b]=(hz[b]||0)+1;}
  console.log('z 分布:',Object.entries(hz).sort((a,b)=>+a[0]-+b[0]).map(([k,v])=>`${k}:${v}`).join(' '));
}
})();