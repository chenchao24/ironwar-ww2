# -*- coding: utf-8 -*-
"""config.js：美/苏/英 14 车炮声 + m26/m4a3/t34-85/su100 引擎（单文件三段式，无独立怠速）"""
import io, re

p = 'js/config.js'
src = io.open(p, encoding='utf-8').read()

FIRE = {
    'm4a3':    ("fire: 'tankSound/usa/us-76mm-fire.mp3',              // 第三人称开炮：76mm M62", "fireAim: 'tankSound/usa/us-76mm-inner.mp3',          // 瞄准镜开炮：76mm 炮膛内声"),
    'm26':     ("fire: 'tankSound/usa/m26-90mm-fire.mp3',             // 第三人称开炮：90mm M82", "fireAim: 'tankSound/usa/m26-90mm-inner.mp3',         // 瞄准镜开炮：90mm 炮膛内声"),
    'm36':     ("fire: 'tankSound/usa/m26-90mm-inner.mp3',            // 第三人称开炮：90mm（敞开炮塔，与镜内同声）", "fireAim: 'tankSound/usa/m26-90mm-inner.mp3',         // 瞄准镜开炮：同上（敞篷无舱内音差）"),
    'm10':     ("fire: 'tankSound/usa/us-75mm-fire.mp3',              // 第三人称开炮：75mm M3（敞开炮塔，与镜内同声）", "fireAim: 'tankSound/usa/us-75mm-fire.mp3',           // 瞄准镜开炮：同上（敞篷无舱内音差）"),
    'm18':     ("fire: 'tankSound/rus/76mm-fire.mp3',                 // 第三人称开炮：76mm M1A2（敞开炮塔，与镜内同声）", "fireAim: 'tankSound/rus/76mm-fire.mp3',              // 瞄准镜开炮：同上（敞篷无舱内音差）"),
    'cromwell': ("fire: 'tankSound/uk/57mm-fire.mp3',                 // 第三人称开炮：57mm QF 6pdr", "fireAim: 'tankSound/uk/57mm-inner.mp3',              // 瞄准镜开炮：57mm 炮膛内声"),
    't34-85':  ("fire: 'tankSound/rus/t34-85mm-fire1.mp3',           // 第三人称开炮：85mm ZiS-S-53", "fireAim: 'tankSound/rus/t34-85mm-inner.mp3',         // 瞄准镜开炮：85mm 炮膛内声"),
    'su100':   ("fire: 'tankSound/rus/100mm-fire.mp3',                // 第三人称开炮：100mm D-10S", "fireAim: 'tankSound/rus/100mm-inner.mp3',            // 瞄准镜开炮：100mm 炮膛内声"),
    'is2':     ("fire: 'tankSound/rus/122mm-fire.mp3',                // 第三人称开炮：122mm D-25T", "fireAim: 'tankSound/rus/122mm-inner.mp3',            // 瞄准镜开炮：122mm 炮膛内声"),
    'is2m':    ("fire: 'tankSound/rus/122mm-fire.mp3',                // 第三人称开炮：122mm D-25T", "fireAim: 'tankSound/rus/122mm-inner.mp3',            // 瞄准镜开炮：122mm 炮膛内声"),
    'su152':   ("fire: 'tankSound/rus/152mm-fire.mp3',                // 第三人称开炮：152mm ML-20S", "fireAim: 'tankSound/rus/152mm-inner.mp3',            // 瞄准镜开炮：152mm 炮膛内声"),
    'isu152':  ("fire: 'tankSound/rus/152mm-fire.mp3',                // 第三人称开炮：152mm ML-20S", "fireAim: 'tankSound/rus/152mm-inner.mp3',            // 瞄准镜开炮：152mm 炮膛内声"),
    'kv1':     ("fire: 'tankSound/rus/76mm-fire.mp3',                 // 第三人称开炮：76.2mm ZiS-5", "fireAim: 'tankSound/rus/76mm-inner.mp3',             // 瞄准镜开炮：76.2mm 炮膛内声"),
    'is1':     ("fire: 'tankSound/rus/85mm-fire.mp3',                 // 第三人称开炮：85mm D-5T", "fireAim: 'tankSound/rus/85mm-inner.mp3',             // 瞄准镜开炮：85mm 炮膛内声"),
}

ENGINE = {
    'm26':    ("drive: 'tankSound/usa/m26-egDown.mp3',                // 新式发动机（单文件三段）：前 4.9s=加速段 / 巡航 / 16.4s 起=减速停车段",
               "seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4.9, driveCruiseEnd: 13.06, driveDecelStart: 16.4 },"),
    'm4a3':   ("drive: 'tankSound/usa/m4-egDown.mp3',                 // 新式发动机（单文件三段）：前 3s=加速段 / 巡航 / 17.4~20s=减速停车段（20s 后剪除）",
               "seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 3.0, driveCruiseEnd: 17.4, driveDecelStart: 17.4, driveDecelEnd: 20.0 },"),
    't34-85': ("drive: 'tankSound/rus/t34-egAll.mp3',                // 新式发动机（单文件三段，与 SU-100 共用）：前 4.9s=加速段 / 巡航 / 13.8s 起=减速停车段",
               "seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4.9, driveCruiseEnd: 13.24, driveDecelStart: 13.8 },"),
    'su100':  ("drive: 'tankSound/rus/t34-egAll.mp3',                // 新式发动机（单文件三段，与 T-34-85 共用）：前 4.9s=加速段 / 巡航 / 13.8s 起=减速停车段",
               "seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4.9, driveCruiseEnd: 13.24, driveDecelStart: 13.8 },"),
}

decls = [(m.start(), m.group(1)) for m in re.finditer(r"^  '([\w-]+)': \{", src, re.M)]

def tank_block(tid, s):
    starts = [pos for (pos, t) in decls if t == tid]
    assert starts, tid + ' decl not found'
    pos = starts[0]
    nxt = min([p2 for (p2, t) in decls if p2 > pos] + [len(s)])
    return pos, nxt

OLD_F = "      fire: 'sound/t90-fire.mp3',"
OLD_A = "      fireAim: 'sound/auto-inner.mp3',"

for tid, (nf, na) in FIRE.items():
    pos, nxt = tank_block(tid, src)
    block = src[pos:nxt]
    if OLD_F not in block or OLD_A not in block:
        print('skip fire', tid, '(already patched)')
    else:
        src = src[:pos] + block.replace(OLD_F, '      ' + nf).replace(OLD_A, '      ' + na) + src[nxt:]
    decls = [(m.start(), m.group(1)) for m in re.finditer(r"^  '([\w-]+)': \{", src, re.M)]
    print('ok fire', tid)

for tid, (drive_line, seg_line) in ENGINE.items():
    pos, nxt = tank_block(tid, src)
    block = src[pos:nxt]
    old_eng = "      engine: 'sound/t90-eg.mp3',\n"
    old_seg = "      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },"
    assert old_eng in block and old_seg in block, tid + ': t90 engine/seg missing'
    block = block.replace(old_eng, '      ' + drive_line + '\n').replace(old_seg, '      ' + seg_line)
    src = src[:pos] + block + src[nxt:]
    decls = [(m.start(), m.group(1)) for m in re.finditer(r"^  '([\w-]+)': \{", src, re.M)]
    print('ok engine', tid)

io.open(p, 'w', encoding='utf-8', newline='\n').write(src)
print('config done: 14 fire + 4 engine')
