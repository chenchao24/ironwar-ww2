# 2026-09-23 应用用户编辑器导出的 pz4g 装甲&命中模型 → pz4g + pz4j（两车同构）
# 数据来自 _recv_四号G装甲.txt（编辑器导出 2026-09-23T11:11），替换 armorModel 与 internal 两个块，其余字段不动
import io, sys

ROOT = r'C:\Users\CC\Desktop\ironWar-ww2'
P = ROOT + r'\js\config.js'

ARMOR = """    armorModel: {
      hull: {
        box: { x0: -1.2, x1: 1.2, y0: 0.25, y1: 1.32, z0: -2.75, z1: 2.95 },
        plates: [
          { name: '战斗室正面', face: 'front', t: 80, pos: [0, 1.21, 2], size: [2.3, 0.75], rot: [-12, 0, 0] },
          { name: '首下', face: 'front', t: 80, pos: [0, 0.72, 2.88], size: [2.3, 0.55], rot: [9, 0, 0] },
          { name: '车首鼻', face: 'front', t: 30, pos: [0, 0.35, 2.7], size: [2.3, 0.5], rot: [30, 0, 0] },
          { name: '首上左', face: 'front', t: 80, pos: [0.02, 1.09, 2.42], size: [2.31, 1.05], rot: [-73.5, 0, 0] },
          { name: '首上右', face: 'front', t: 80, pos: [0, 1.57, 1.51], size: [2.39, 1.01], rot: [-87.5, 0, 0] },
          { name: '车尾', face: 'rear', t: 20, pos: [0, 0.99, -2.42], size: [2.3, 1.08], rot: [-5, 0, 0] },
          { name: '侧上', face: 'side', t: 30, pos: [1.16, 1.1, 0], size: [5.5, 0.8], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 30, pos: [1.28, 0.55, 0], size: [5.5, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 12, pos: [0, 1.5, -0.19], size: [2.3, 4.56], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.15, x1: 1.15, y0: 1.32, y1: 2.35, z0: -1.47, z1: 1.04 },
        plates: [
          { name: '炮盾', face: 'front', t: 50, pos: [0, 1.98, 1.05], size: [1.39, 0.71], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 50, pos: [-0.8, 1.88, 0.7], size: [0.7, 0.92], rot: [0, -60, 0] },
          { name: '炮塔正面', face: 'front', t: 50, pos: [0.8, 1.87, 0.7], size: [0.7, 0.94], rot: [0, 60, 0] },
          { name: '炮塔尾部', face: 'rear', t: 30, pos: [0, 1.95, -1.11], size: [1.85, 0.9], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 30, pos: [0.89, 1.95, -0.34], size: [1.81, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 12, pos: [0, 2.33, -0.2], size: [1.9, 2.4], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },"""

INTERNAL = """    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.30, y: 2.00, z: -0.50, r: 0.34 },
        { id: 'gunner',    name: '炮手',   x: -0.30, y: 1.85, z: 0.50,  r: 0.32 },
        { id: 'loader',    name: '装填手', x: 0.40,  y: 1.85, z: 0.00,  r: 0.34 },
        { id: 'driver',    name: '驾驶员', x: -0.50, y: 1.05, z: 1.50,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: 0.50,  y: 1.05, z: 1.36,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.00, z: -1.90,  r: 0.42 }],
        fuel:        [{ x: -0.83, y: 0.90, z: -1.70,  r: 0.36 }, { x: 0.51, y: 0.90, z: -1.70, r: 0.32 }],
        ammoRacks:   [{ x: -0.62, y: 0.90, z: -0.12,  r: 0.42 }, { x: 0.58, y: 0.90, z: -0.05, r: 0.42 },
                      { x: 0,     y: 1.50, z: -0.76,  r: 0.29 }],
        breech:      [{ x: 0.05,  y: 1.94, z: 0.60,   r: 0.34 }],
        turretDrive: [{ x: -0.25, y: 1.35, z: 0.10,   r: 0.30 }],
        optics:      [{ x: -0.30, y: 2.10, z: 0.80,   r: 0.26 }],
      },
      ringY: 1.30,
      trackX: 1.28, trackY: 1.0,
    },"""

def block_end(src, i):
    """i 指向 '{'，返回该对象字面量结束（含 } 与可能的逗号）后的索引"""
    assert src[i] == '{'
    d = 0
    j = i
    while j < len(src):
        c = src[j]
        if c == '{': d += 1
        elif c == '}':
            d -= 1
            if d == 0:
                j += 1
                if j < len(src) and src[j] == ',': j += 1
                return j
        j += 1
    raise RuntimeError('unbalanced braces')

def replace_block(src, start, name, newtext):
    """在 src 的 tank 块范围内，把 'name: {' 整块替换为 newtext"""
    key = '    ' + name + ': {'
    i = src.find(key, start)
    if i < 0: raise RuntimeError(name + ' not found')
    j = block_end(src, i + len(key) - 1)
    return src[:i] + newtext + src[j:]

src = io.open(P, encoding='utf-8').read()

for tid in ('pz4g', 'pz4j'):
    anchor = "  '%s': {" % tid
    k = src.find(anchor)
    if k < 0: raise RuntimeError(tid + ' block not found')
    src = replace_block(src, k, 'armorModel', ARMOR)
    src = replace_block(src, k, 'internal', INTERNAL)
    print(tid, 'armorModel + internal replaced')

io.open(P, 'w', encoding='utf-8', newline='').write(src)
print('config.js written')
