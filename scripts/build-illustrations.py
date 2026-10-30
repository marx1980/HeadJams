#!/usr/bin/env python3
"""Build the illustrated icon set (src/ui/illustrations.ts).

Style (agreed 2026-10-30, a mix of "Soft gradient" and "Cel shaded"): emoji-level detail drawn in ONE hue.
Every colour is a tone of the icon's currentColor (classes f0-f4 for fills, k0-k4 for strokes, s0-s4 for
gradient stops, defined in styles.css under `.illo`), so an icon takes the family, accent or text colour of
wherever it sits and changes with the skin. Each main shape gets: a darker side for depth, a soft
light-to-dark gradient, a crisp light crescent on the upper left, a crisp shadow crescent on the lower
right, and a white glint. Light always comes from the upper left of the screen.

Tones: f0 deepest, f1 dark, f2 the colour itself, f3 light, f4 lightest; fw is white.
Ids: every id starts with ID_, replaced per instance by Icon.tsx so several icons can share a page.

Run: python3 scripts/build-illustrations.py  (also writes docs/icons/illustrations.html for a visual check)
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Art:
    def __init__(self):
        self.defs = []
        self.body = []
        self.n = 0

    def uid(self, prefix):
        self.n += 1
        return f'ID_{prefix}{self.n}'

    def add(self, *parts):
        self.body.extend(parts)

    def grad(self, kind='g', stops=None, angle=None):
        """Gradients in the icon's own tones: g = light upper left to dark lower right, h = a cylinder lit from the left,
        v = light top to dark bottom, d = dark."""
        gid = self.uid('gr')
        presets = {
            'g': ('0 0 1 1', [(0, 3), (.5, 2), (1, 1)]),
            'h': ('0 0 1 0', [(0, 1), (.28, 3), (.6, 2), (1, 1)]),
            'v': ('0 0 0 1', [(0, 3), (.55, 2), (1, 1)]),
            'd': ('0 0 1 1', [(0, 1), (1, 0)]),
            'l': ('0 0 1 1', [(0, 4), (.6, 3), (1, 2)]),
        }
        coords, default = presets[kind]
        x1, y1, x2, y2 = coords.split()
        stops = stops or default
        s = ''.join(f'<stop offset="{o}" class="s{t}"/>' for o, t in stops)
        self.defs.append(f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{s}</linearGradient>')
        return f'url(#{gid})'

    def shaded(self, d, rot=0, scale=1, depth=3.5, light=3.2, dark=4.5, grad='g', glint=None, transform='', evenodd=False):
        """One main shape: depth side, gradient, crisp light and shadow crescents, optional glint (cx, cy, rx, ry, angle)."""
        # Offsets are given on screen; convert to the shape's own (rotated, scaled) coordinates.
        r = math.radians(-rot)

        def local(mx, my):
            x = (mx * math.cos(r) - my * math.sin(r)) / scale
            y = (mx * math.sin(r) + my * math.cos(r)) / scale
            return f'{x:.2f} {y:.2f}'

        tr = f' transform="{transform}"' if transform else ''
        if evenodd:
            tr += ' fill-rule="evenodd" clip-rule="evenodd"'
        a, b, c = self.uid('cA'), self.uid('cB'), self.uid('cC')
        self.defs.append(f'<clipPath id="{a}"><path d="{d}"{tr}/></clipPath>')
        rule = ' clip-rule="evenodd" fill-rule="evenodd"' if evenodd else ''
        self.defs.append(f'<clipPath id="{b}"><path d="{d}"{rule} transform="{transform} translate({local(light, light)})"/></clipPath>')
        self.defs.append(f'<clipPath id="{c}"><path d="{d}"{rule} transform="{transform} translate({local(-dark, -dark)})"/></clipPath>')
        fill = self.grad(grad) if len(grad) == 1 else grad
        out = []
        if depth:
            out.append(f'<path d="{d}" class="f0"{" fill-rule=\"evenodd\"" if evenodd else ""} transform="{transform} translate({local(depth, depth)})"/>')
        out.append(f'<g clip-path="url(#{a})"><path d="{d}"{tr} class="f3"/>'
                   f'<g clip-path="url(#{b})"><path d="{d}"{tr} class="f1"/>'
                   f'<g clip-path="url(#{c})"><path d="{d}"{tr} fill="{fill}"/></g></g></g>')
        if glint:
            cx, cy, rx, ry, ang = glint
            out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" class="fw" opacity=".8" transform="rotate({ang} {cx} {cy})"/>')
        self.add(*out)

    def svg(self):
        return f'<defs>{"".join(self.defs)}</defs>{"".join(self.body)}'


def rr(x, y, w, h, r):
    """Rounded rectangle as a path."""
    return (f'M{x + r},{y} H{x + w - r} A{r},{r} 0 0 1 {x + w},{y + r} V{y + h - r} A{r},{r} 0 0 1 {x + w - r},{y + h} '
            f'H{x + r} A{r},{r} 0 0 1 {x},{y + h - r} V{y + r} A{r},{r} 0 0 1 {x + r},{y} Z')


def ellipse(cx, cy, rx, ry):
    return f'M{cx - rx},{cy} A{rx},{ry} 0 1 0 {cx + rx},{cy} A{rx},{ry} 0 1 0 {cx - rx},{cy} Z'


# ---------------------------------------------------------------- instruments

def guitar():
    art = Art()
    t = 'translate(65 62) rotate(40) scale(0.72) translate(-50 -110)'
    body = ('M50,100 C65.7,100 75.8,108 75.8,120 C75.8,130 67.9,134 69,141 C70.2,148 83.6,154 83.6,172 '
            'C83.6,192 67.9,206 50,206 C32.1,206 16.4,192 16.4,172 C16.4,154 29.8,148 31,141 C32.1,134 24.2,130 24.2,120 C24.2,108 34.3,100 50,100 Z')
    art.add(f'<g transform="{t}">')
    art.shaded(body, rot=40, scale=.72, depth=4, light=2.6, dark=3.6, glint=(34, 116, 3.2, 6, -30))
    art.add('<path d="M59,156 C67.9,154 74.6,160 73.5,168 C72.4,174 65.7,176 61.2,172 C63.4,166 62.3,160 59,156 Z" class="f1"/>',
            '<circle cx="50" cy="150" r="13.2" class="f3"/><circle cx="50" cy="150" r="11.2" class="f1"/><circle cx="50" cy="150" r="10" class="f0"/>',
            '<path d="M41,153 A10,10 0 0 0 59,153 A10,10 0 0 1 41,153 Z" class="f1" opacity=".6"/>',
            # headstock, pegs, neck
            '<path d="M42,40 L40,19 Q40,14 45,14 L55,14 Q60,14 60,19 L58,40 Z" class="f2"/><path d="M50,14 L55,14 Q60,14 60,19 L58,40 L50,40 Z" class="f1"/>')
    for y in (20.5, 27, 33.5):
        art.add(f'<rect x="33.9" y="{y - 2.4}" width="7.4" height="4.8" rx="2.4" class="f3"/><rect x="58.7" y="{y - 2.4}" width="7.4" height="4.8" rx="2.4" class="f3"/>',
                f'<circle cx="45.2" cy="{y}" r="1.3" class="f4"/><circle cx="54.8" cy="{y}" r="1.3" class="f4"/>')
    art.add('<rect x="44.4" y="38" width="11.2" height="98" class="f2"/><rect x="50" y="38" width="5.6" height="98" class="f1"/>',
            '<rect x="45.6" y="39" width="8.8" height="97" class="f0"/>')
    for y in (46, 52, 58, 64, 69, 74, 79, 83, 87, 91, 95, 99, 103, 107, 111, 115, 119, 123, 127):
        art.add(f'<line x1="45.6" x2="54.4" y1="{y}" y2="{y}" class="k3" stroke-width="1" opacity=".8"/>')
    for y in (55, 66.5, 85):
        art.add(f'<circle cx="50" cy="{y}" r="1.4" class="f3"/>')
    art.add('<rect x="44.6" y="36.8" width="10.8" height="2.6" rx=".6" class="f4"/>',
            '<rect x="37" y="175.5" width="26" height="6.5" rx="3" class="f0"/><rect x="40" y="177.6" width="20" height="1.5" rx=".7" class="f4"/>')
    for i in range(6):
        art.add(f'<line x1="{46.8 + i * 1.28:.2f}" y1="38" x2="{44.5 + i * 2.2:.2f}" y2="178.5" class="k4" stroke-width=".7"/>')
    art.add('</g>')
    return art.svg()


def bass():
    art = Art()
    t = 'translate(64 64) rotate(-40) scale(0.62) translate(-52 -104)'
    body = ('M38,118 C33,110 23,108 20,115 C17,122 25,130 25,139 C25,147 15,152 15,168 C15,188 32,202 52,202 '
            'C73,202 88,190 88,171 C88,157 77,151 77,141 C77,133 86,128 84,119 C82,110 72,110 67,117 C63,123 57,124 52,124 C46,124 42,123 38,118 Z')
    art.add(f'<g transform="{t}">')
    art.shaded(body, rot=-40, scale=.62, depth=4, light=2.6, dark=3.6, glint=(28, 132, 3, 8, 20))
    art.add('<path d="M40,130 C46,134 58,134 64,130 C68,138 66,150 72,158 C76,166 74,176 66,180 C56,184 40,182 34,174 C28,166 34,150 34,142 C34,136 36,132 40,130 Z" class="f1" opacity=".55"/>',
            '<rect x="40" y="146" width="11" height="7" rx="3" class="f0"/><rect x="53" y="150" width="11" height="7" rx="3" class="f0"/>',
            '<rect x="42" y="148" width="7" height="1.6" rx=".8" class="f3"/><rect x="55" y="152" width="7" height="1.6" rx=".8" class="f3"/>',
            '<rect x="42" y="176" width="22" height="7" rx="2" class="f0"/><rect x="44" y="178" width="18" height="1.8" class="f4"/>',
            '<circle cx="72" cy="168" r="4" class="f3"/><circle cx="76" cy="180" r="4" class="f3"/><circle cx="71" cy="167" r="1.4" class="fw" opacity=".8"/><circle cx="75" cy="179" r="1.4" class="fw" opacity=".8"/>',
            # neck and headstock
            '<path d="M46,30 L44,9 Q44,3 50,3 L60,4 Q65,5 64,10 L58,30 Z" class="f2"/><path d="M52,3 L60,4 Q65,5 64,10 L58,30 L52,30 Z" class="f1"/>')
    for y in (8, 14, 20, 26):
        art.add(f'<rect x="64" y="{y - 2.4}" width="8" height="4.8" rx="2.4" class="f3"/><circle cx="60.5" cy="{y}" r="1.3" class="f4"/>')
    art.add('<rect x="45.6" y="28" width="12.8" height="104" class="f2"/><rect x="52" y="28" width="6.4" height="104" class="f1"/>',
            '<rect x="46.8" y="29" width="10.4" height="103" class="f0"/>')
    for y in range(36, 130, 7):
        art.add(f'<line x1="46.8" x2="57.2" y1="{y}" y2="{y}" class="k3" stroke-width="1" opacity=".8"/>')
    art.add('<rect x="46" y="27" width="12" height="2.6" rx=".6" class="f4"/>')
    for i in range(4):
        art.add(f'<line x1="{48.6 + i * 2.3:.2f}" y1="28" x2="{46.4 + i * 4.3:.2f}" y2="178" class="k4" stroke-width=".9"/>')
    art.add('</g>')
    return art.svg()


def drum_kit():
    art = Art()
    # cymbal and stand behind
    art.add('<line x1="100" y1="34" x2="104" y2="118" class="k1" stroke-width="3.2" stroke-linecap="round"/>',
            '<path d="M96,118 L104,104 L112,118" class="k1" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    art.shaded(ellipse(100, 30, 25, 7), depth=2, light=1.6, dark=2.4, grad='l', transform='rotate(-12 100 30)')
    art.add('<ellipse cx="100" cy="30" rx="4" ry="1.6" class="f1" transform="rotate(-12 100 30)"/>',
            '<path d="M80,32 Q100,22 120,26" class="k4" stroke-width="1.2" fill="none" opacity=".8"/>')
    # tom on top of the bass drum
    tom = 'M28,36 L28,52 A20,7 0 0 0 68,52 L68,36 Z'
    art.shaded(tom, depth=2.5, light=2, dark=3, grad='h')
    art.shaded(ellipse(48, 36, 20, 7), depth=0, light=1.6, dark=2, grad='l')
    art.add('<path d="M28,36 A20,7 0 0 0 68,36" class="k1" stroke-width="2" fill="none"/>',
            '<path d="M28,51 A20,7 0 0 0 68,51" class="k1" stroke-width="2.4" fill="none"/>')
    for x in (34, 48, 62):
        art.add(f'<line x1="{x}" y1="{42.5 if x == 48 else 41.5}" x2="{x}" y2="{56 if x == 48 else 55}" class="k3" stroke-width="1.6"/>')
    # bass drum
    art.shaded(ellipse(60, 86, 36, 34), depth=4, light=3, dark=4.2, glint=(40, 64, 4, 8, -40))
    art.add('<circle cx="60" cy="86" r="34" class="k0" stroke-width="2" fill="none"/>',
            '<circle cx="60" cy="86" r="28" class="f4" opacity=".9"/><circle cx="60" cy="86" r="28" class="k2" stroke-width="1.5" fill="none"/>',
            '<path d="M38,103 A28,28 0 0 0 82,103 A30,22 0 0 1 38,103 Z" class="f3"/>',
            '<circle cx="60" cy="86" r="11" class="f2"/><circle cx="60" cy="86" r="11" class="k1" stroke-width="1.6" fill="none"/>',
            '<path d="M53,82 L60,90 L67,82" class="k4" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    for ang in range(0, 360, 45):
        x, y = 60 + 31 * math.cos(math.radians(ang)), 86 + 31 * math.sin(math.radians(ang))
        art.add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.2" class="f1"/><circle cx="{x - .5:.1f}" cy="{y - .5:.1f}" r=".9" class="f4"/>')
    art.add('<path d="M30,112 L22,124 M90,112 L98,124" class="k1" stroke-width="3.4" stroke-linecap="round"/>')
    return art.svg()


def snare():
    art = Art()
    shell = 'M22,56 L22,92 A42,15 0 0 0 106,92 L106,56 Z'
    art.shaded(shell, depth=3.5, light=2.4, dark=3.4, grad='h')
    art.add('<path d="M22,62 A42,15 0 0 0 106,62 L106,56 A42,15 0 0 1 22,56 Z" class="f1"/>',
            '<path d="M22,86 A42,15 0 0 0 106,86 L106,92 A42,15 0 0 1 22,92 Z" class="f1"/>',
            '<path d="M22,62.5 A42,15 0 0 0 106,62.5" class="k3" stroke-width="1.2" fill="none"/>',
            '<path d="M22,86.5 A42,15 0 0 0 106,86.5" class="k3" stroke-width="1.2" fill="none" opacity=".7"/>')
    for x in (30, 47, 64, 81, 98):
        dy = 15 * math.sqrt(max(0, 1 - ((x - 64) / 42) ** 2))
        art.add(f'<line x1="{x}" y1="{60 + dy:.1f}" x2="{x}" y2="{88 + dy:.1f}" class="k4" stroke-width="1.6"/>',
                f'<rect x="{x - 2.6}" y="{70 + dy:.1f}" width="5.2" height="8" rx="2" class="f3"/><rect x="{x - 1.2}" y="{71 + dy:.1f}" width="1.3" height="5" class="fw" opacity=".7"/>')
    art.shaded(ellipse(64, 56, 42, 15), depth=0, light=2.2, dark=2.6, grad='l', glint=(44, 50, 7, 2.6, -8))
    art.add('<ellipse cx="64" cy="56" rx="42" ry="15" class="k1" stroke-width="2.2" fill="none"/>')
    # sticks
    for (x1, y1, x2, y2) in ((18, 16, 76, 52), (110, 14, 52, 52)):
        art.add(f'<line x1="{x1 + 1.5}" y1="{y1 + 1.5}" x2="{x2 + 1.5}" y2="{y2 + 1.5}" class="k0" stroke-width="7" stroke-linecap="round"/>',
                f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="k3" stroke-width="7" stroke-linecap="round"/>',
                f'<line x1="{x1}" y1="{y1 - 1.6}" x2="{x2}" y2="{y2 - 1.6}" class="k4" stroke-width="2" stroke-linecap="round"/>',
                f'<circle cx="{x2}" cy="{y2}" r="4.4" class="f2"/><circle cx="{x2 - 1.2}" cy="{y2 - 1.2}" r="1.5" class="fw" opacity=".8"/>')
    return art.svg()


def maracas():
    art = Art()
    for rot, cx in ((-24, 44), (24, 84)):
        t = f'rotate({rot} {cx} 96)'
        art.add(f'<g transform="{t}">')
        art.add(f'<path d="{rr(cx - 5.5, 66, 11, 52, 5.5)}" class="f0" transform="translate(2 1)"/>',
                f'<path d="{rr(cx - 5.5, 66, 11, 52, 5.5)}" class="f1"/><rect x="{cx - 4}" y="68" width="3" height="46" rx="1.5" class="f3"/>')
        art.shaded(ellipse(cx, 44, 21, 27), rot=rot, depth=3, light=2.6, dark=3.4, glint=(cx - 8, 30, 3.4, 7, -20))
        art.add(f'<path d="M{cx - 20},40 Q{cx},48 {cx + 20},40" class="k1" stroke-width="3.2" fill="none"/>',
                f'<path d="M{cx - 19},50 Q{cx},58 {cx + 19},50" class="k1" stroke-width="3.2" fill="none"/>',
                f'<path d="M{cx - 20},41.5 Q{cx},49.5 {cx + 20},41.5" class="k4" stroke-width="1" fill="none" opacity=".7"/>',
                f'<ellipse cx="{cx}" cy="70" rx="7" ry="2.6" class="f1"/>')
        for dx, dy in ((-9, 26), (6, 24), (10, 62), (-4, 64)):
            art.add(f'<circle cx="{cx + dx}" cy="{dy}" r="1.8" class="f4" opacity=".85"/>')
        art.add('</g>')
    return art.svg()


def keyboard():
    art = Art()
    art.add('<g transform="rotate(-10 64 66)">')
    case = rr(8, 34, 112, 64, 8)
    art.shaded(case, rot=-10, depth=5, light=2.4, dark=3.2)
    art.add('<rect x="14" y="40" width="100" height="12" rx="3" class="f1"/>',
            '<circle cx="24" cy="46" r="3.6" class="f3"/><circle cx="34" cy="46" r="3.6" class="f3"/><rect x="74" y="43" width="34" height="6" rx="2" class="f0"/>',
            '<path d="M76,46 l4,-2 4,4 4,-4 4,4 4,-4 4,4 4,-2" class="k3" stroke-width="1.2" fill="none"/>',
            '<circle cx="23" cy="45" r="1.2" class="fw" opacity=".8"/><circle cx="33" cy="45" r="1.2" class="fw" opacity=".8"/>')
    for i in range(7):
        x = 14 + i * 14.3
        art.add(f'<path d="{rr(x + .6, 55, 13, 37, 2.4)}" class="f4"/>',
                f'<rect x="{x + .6}" y="84" width="13" height="8" rx="2.4" class="f3"/>',
                f'<rect x="{x + 10.6}" y="56" width="3" height="28" class="f3" opacity=".8"/>')
    for i in (0, 1, 3, 4, 5):
        x = 14 + (i + 1) * 14.3 - 4.6
        art.add(f'<path d="{rr(x, 55, 9.2, 22, 2)}" class="f0"/>',
                f'<rect x="{x + 1.6}" y="56" width="2.2" height="17" rx="1.1" class="f2" opacity=".85"/>')
    art.add('<rect x="14" y="54" width="100" height="2" class="f1"/></g>')
    return art.svg()


def violin():
    art = Art()
    # bow behind
    art.add('<line x1="16" y1="110" x2="112" y2="18" class="k0" stroke-width="4.6" stroke-linecap="round"/>',
            '<line x1="16" y1="110" x2="112" y2="18" class="k2" stroke-width="3" stroke-linecap="round"/>',
            '<line x1="20" y1="114" x2="114" y2="24" class="k4" stroke-width="1.4"/>',
            f'<path d="{rr(10, 104, 12, 9, 2)}" class="f1" transform="rotate(-44 16 108)"/>')
    t = 'translate(60 66) rotate(32) scale(0.62) translate(-50 -110)'
    body = ('M50,96 C66,96 74,104 74,116 C74,126 64,130 64,138 C64,146 80,150 80,170 '
            'C80,192 66,204 50,204 C34,204 20,192 20,170 C20,150 36,146 36,138 C36,130 26,126 26,116 C26,104 34,96 50,96 Z')
    art.add(f'<g transform="{t}">')
    art.shaded(body, rot=32, scale=.62, depth=4, light=2.8, dark=3.8, glint=(34, 112, 3.2, 6, -30))
    art.add('<path d="M38,148 c-3,4 3,8 0,12 c-3,4 3,8 0,12" class="k0" stroke-width="2" fill="none"/><circle cx="38" cy="148" r="1.8" class="f0"/><circle cx="38" cy="172" r="1.8" class="f0"/>',
            '<path d="M62,148 c3,4 -3,8 0,12 c3,4 -3,8 0,12" class="k0" stroke-width="2" fill="none"/><circle cx="62" cy="148" r="1.8" class="f0"/><circle cx="62" cy="172" r="1.8" class="f0"/>',
            '<path d="M44,186 L56,186 L58,202 L42,202 Z" class="f0"/>',
            '<rect x="40" y="163" width="20" height="3.6" rx="1.2" class="f4"/>',
            '<path d="M45,30 L55,30 L56,160 L44,160 Z" class="f0"/>',
            '<path d="M46,30 L50,30 L50,160 L45,160 Z" class="f1" opacity=".6"/>',
            # scroll and pegbox
            '<rect x="44" y="12" width="12" height="20" rx="3" class="f1"/>',
            '<circle cx="50" cy="8" r="8" class="f2"/><path d="M50,8 m-4,0 a4,4 0 1 1 4,4 a2.4,2.4 0 1 1 -2.4,-2.4" class="k0" stroke-width="1.8" fill="none"/>',
            '<circle cx="47" cy="5" r="1.6" class="fw" opacity=".8"/>',
            '<rect x="36" y="16" width="8" height="4" rx="2" class="f3"/><rect x="56" y="22" width="8" height="4" rx="2" class="f3"/>',
            '<rect x="36" y="24" width="8" height="4" rx="2" class="f3"/><rect x="56" y="14" width="8" height="4" rx="2" class="f3"/>')
    for i in range(4):
        art.add(f'<line x1="{47.6 + i * 1.6:.1f}" y1="30" x2="{46 + i * 2.7:.1f}" y2="186" class="k4" stroke-width=".9"/>')
    art.add('</g>')
    return art.svg()


def trumpet():
    art = Art()
    # lower loop of tubing behind
    art.add('<path d="M40,72 H86 Q96,72 96,82 Q96,92 86,92 H52 Q42,92 42,84" class="k0" stroke-width="9" fill="none" stroke-linecap="round"/>',
            '<path d="M40,72 H86 Q96,72 96,82 Q96,92 86,92 H52 Q42,92 42,84" class="k2" stroke-width="6.4" fill="none" stroke-linecap="round"/>',
            '<path d="M44,70.6 H86 Q94,70.6 95,79" class="k4" stroke-width="1.6" fill="none" stroke-linecap="round"/>')
    # main tube and mouthpiece
    art.add('<path d="M10,58 H82" class="k0" stroke-width="9.6" stroke-linecap="round"/>',
            '<path d="M10,57 H82" class="k2" stroke-width="7" stroke-linecap="round"/>',
            '<path d="M14,55 H80" class="k4" stroke-width="1.8" stroke-linecap="round"/>',
            f'<path d="M4,52 L12,55 L12,61 L4,64 Z" class="f1"/><rect x="2" y="51" width="4" height="14" rx="2" class="f2"/>')
    # bell
    bell = 'M78,52 C92,50 104,40 118,26 L120,26 C122,44 122,72 120,90 L118,90 C104,76 92,66 78,64 Z'
    art.shaded(bell, depth=3, light=2.2, dark=3.2, glint=(100, 46, 2.4, 7, -40))
    art.shaded(ellipse(119, 58, 6, 32), depth=0, light=1.2, dark=1.6, grad='l')
    art.add('<ellipse cx="120" cy="58" rx="3.4" ry="26" class="f0"/>')
    # valves
    for x in (46, 58, 70):
        art.shaded(rr(x - 4.5, 40, 9, 36, 3), depth=2, light=1.4, dark=2, grad='h')
        art.add(f'<rect x="{x - 5.5}" y="38" width="11" height="5" rx="2" class="f1"/>',
                f'<rect x="{x - 1.6}" y="28" width="3.2" height="10" class="f1"/>',
                f'<ellipse cx="{x}" cy="27" rx="5.6" ry="2.6" class="f3"/><ellipse cx="{x - 1.4}" cy="26.2" rx="2" ry=".9" class="fw" opacity=".8"/>',
                f'<rect x="{x - 5}" y="64" width="10" height="4" rx="1.6" class="f1"/>')
    return art.svg()


def synth():
    art = Art()
    art.add('<g transform="rotate(-8 64 64)">')
    art.shaded(rr(8, 28, 112, 72, 9), rot=-8, depth=5, light=2.4, dark=3.4)
    art.add('<rect x="16" y="36" width="34" height="18" rx="3" class="f0"/>',
            '<path d="M19,49 Q23,38 27,45 T35,45 T43,40 T48,46" class="k3" stroke-width="1.6" fill="none"/>')
    for i, x in enumerate((62, 78, 94, 110)):
        art.add(f'<circle cx="{x}" cy="{45}" r="6.4" class="f0"/><circle cx="{x}" cy="44" r="5.4" class="f3"/>',
                f'<line x1="{x}" y1="44" x2="{x + (2.6 if i % 2 else -2)}" y2="{40}" class="k0" stroke-width="1.6" stroke-linecap="round"/>',
                f'<circle cx="{x - 2}" cy="42" r="1.3" class="fw" opacity=".8"/>')
    art.add('<rect x="14" y="60" width="100" height="32" rx="3" class="f1"/>')
    for i in range(10):
        x = 16 + i * 9.6
        art.add(f'<rect x="{x}" y="62" width="8.6" height="28" rx="1.6" class="f4"/><rect x="{x}" y="85" width="8.6" height="5" rx="1.6" class="f3"/>')
    for i in (0, 1, 3, 4, 5, 7, 8):
        x = 16 + (i + 1) * 9.6 - 3.2
        art.add(f'<rect x="{x}" y="62" width="5.4" height="16" rx="1.2" class="f0"/><rect x="{x + 1}" y="63" width="1.4" height="12" rx=".7" class="f2"/>')
    art.add('</g>')
    return art.svg()


def sparkles():
    art = Art()

    def star(cx, cy, r, inner):
        return (f'M{cx},{cy - r} C{cx + inner * .3},{cy - inner} {cx + inner},{cy - inner * .3} {cx + r},{cy} '
                f'C{cx + inner},{cy + inner * .3} {cx + inner * .3},{cy + inner} {cx},{cy + r} '
                f'C{cx - inner * .3},{cy + inner} {cx - inner},{cy + inner * .3} {cx - r},{cy} '
                f'C{cx - inner},{cy - inner * .3} {cx - inner * .3},{cy - inner} {cx},{cy - r} Z')

    for cx, cy, r, inner, glint in ((54, 68, 46, 9, True), (100, 26, 20, 4, False), (102, 100, 15, 3, False)):
        art.shaded(star(cx, cy, r, inner), depth=3 if r > 30 else 2, light=2, dark=2.6, grad='l')
        # facets: the right and lower halves a step darker, crisp
        art.add(f'<path d="M{cx},{cy - r} C{cx + inner * .3},{cy - inner} {cx + inner},{cy - inner * .3} {cx + r},{cy} L{cx},{cy} Z" class="f2" opacity=".55"/>',
                f'<path d="M{cx + r},{cy} C{cx + inner},{cy + inner * .3} {cx + inner * .3},{cy + inner} {cx},{cy + r} L{cx},{cy} Z" class="f1" opacity=".6"/>',
                f'<path d="M{cx},{cy + r} C{cx - inner * .3},{cy + inner} {cx - inner},{cy + inner * .3} {cx - r},{cy} L{cx},{cy} Z" class="f2" opacity=".35"/>')
        if glint:
            art.add(f'<ellipse cx="{cx - 6}" cy="{cy - 14}" rx="2" ry="8" class="fw" opacity=".8"/>')
    return art.svg()


def microphone():
    art = Art()
    art.add('<path d="M34,52 Q34,84 64,84 Q94,84 94,52" class="k0" stroke-width="7" fill="none" stroke-linecap="round"/>',
            '<path d="M34,51 Q34,82 64,82 Q94,82 94,51" class="k2" stroke-width="4.4" fill="none" stroke-linecap="round"/>',
            '<path d="M60,84 H68 V108 H60 Z" class="f1"/><rect x="61" y="86" width="2" height="20" class="f3"/>')
    art.shaded(ellipse(64, 114, 28, 7), depth=2, light=1.4, dark=2)
    art.shaded(rr(44, 8, 40, 66, 20), depth=3.5, light=2.6, dark=3.4, grad='h')
    gid = art.uid('pat')
    art.defs.append(f'<pattern id="{gid}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
                    f'<rect width="5" height="5" fill="none"/><path d="M0,0 V5 M0,0 H5" class="k1" stroke-width="1.1" opacity=".75"/></pattern>')
    clip = art.uid('mc')
    art.defs.append(f'<clipPath id="{clip}"><path d="{rr(44, 8, 40, 66, 20)}"/></clipPath>')
    art.add(f'<g clip-path="url(#{clip})"><rect x="44" y="8" width="40" height="34" fill="url(#{gid})"/>'
            f'<rect x="44" y="50" width="40" height="30" fill="url(#{gid})"/></g>',
            '<rect x="43" y="40" width="42" height="11" rx="2" class="f0"/><rect x="45" y="42" width="38" height="2" class="f2"/>',
            '<ellipse cx="54" cy="22" rx="3.4" ry="9" class="fw" opacity=".75"/>')
    return art.svg()


def faders():
    art = Art()
    art.shaded(rr(14, 14, 100, 100, 14), depth=5, light=2.6, dark=3.4)
    for i, (x, cap) in enumerate(((38, 52), (64, 78), (90, 40))):
        art.add(f'<rect x="{x - 3}" y="26" width="6" height="76" rx="3" class="f0"/>')
        for y in range(30, 100, 10):
            art.add(f'<line x1="{x + 8}" x2="{x + 12}" y1="{y}" y2="{y}" class="k1" stroke-width="1.6" stroke-linecap="round"/>')
        art.shaded(rr(x - 11, cap - 7, 22, 14, 4), depth=2.5, light=1.6, dark=2.2, grad='l')
        art.add(f'<rect x="{x - 8}" y="{cap - .8}" width="16" height="1.6" class="f1"/>')
    return art.svg()


# ---------------------------------------------------------------- tabs and header

def speaker():
    art = Art()
    art.add('<path d="M100,14 L110,20 L110,118 L100,122 Z" class="f0"/>')
    art.shaded(rr(22, 10, 80, 112, 10), depth=0, light=2.6, dark=3.4, glint=(32, 22, 2.6, 7, 0))
    art.add('<circle cx="62" cy="38" r="15" class="f1"/>')
    art.shaded(ellipse(62, 38, 11, 11), depth=0, light=1.6, dark=2.2, grad='d')
    art.add('<circle cx="62" cy="38" r="4.4" class="f3"/><circle cx="60.6" cy="36.6" r="1.6" class="fw" opacity=".85"/>',
            '<circle cx="62" cy="86" r="29" class="f1"/><circle cx="62" cy="86" r="26" class="f0"/>')
    art.shaded(ellipse(62, 86, 22, 22), depth=0, light=2, dark=2.6, grad='d')
    art.add('<circle cx="62" cy="86" r="22" class="k1" stroke-width="1.2" fill="none"/><circle cx="62" cy="86" r="15" class="k1" stroke-width="1" fill="none" opacity=".7"/>')
    art.shaded(ellipse(62, 86, 8, 8), depth=0, light=1.2, dark=1.6, grad='l')
    art.add('<circle cx="59.6" cy="83.6" r="2.2" class="fw" opacity=".85"/>')
    for x, y in ((30, 18), (94, 18), (30, 114), (94, 114)):
        art.add(f'<circle cx="{x}" cy="{y}" r="2.2" class="f1"/>')
    return art.svg()


def books():
    art = Art()

    def book(x, y, w, h, tilt=0):
        t = f'rotate({tilt} {x + w / 2} {y + h / 2})'
        art.add(f'<g transform="{t}">')
        art.shaded(rr(x, y, w, h, 4), rot=tilt, depth=3, light=2, dark=2.6, grad='g')
        # page block at the right end, set into the cover
        art.add(f'<path d="{rr(x + w - 16, y + 3.5, 13, h - 7, 2)}" class="f4"/>')
        for k in range(1, 4):
            yy = y + 3.5 + k * (h - 7) / 4
            art.add(f'<line x1="{x + w - 15}" x2="{x + w - 4}" y1="{yy:.1f}" y2="{yy:.1f}" class="k3" stroke-width=".9"/>')
        # bands on the spine and a title plate
        art.add(f'<rect x="{x + 9}" y="{y}" width="3.4" height="{h}" class="f1"/><rect x="{x + w - 25}" y="{y}" width="3.4" height="{h}" class="f1"/>',
                f'<rect x="{x + 20}" y="{y + h / 2 - 3.5:.1f}" width="{w - 50}" height="7" rx="3.5" class="f3"/>',
                f'<rect x="{x + 2}" y="{y + 2}" width="{w - 20}" height="2.2" rx="1.1" class="f4" opacity=".7"/>')
        art.add('</g>')

    book(16, 88, 96, 24, 0)
    book(22, 62, 88, 24, -5)
    book(12, 36, 92, 24, 4)
    return art.svg()


def notes():
    art = Art()
    beam = 'M40,30 L104,14 L104,30 L40,46 Z'
    art.add('<rect x="38" y="36" width="6" height="66" class="f1"/><rect x="98" y="22" width="6" height="64" class="f1"/>',
            '<rect x="38.6" y="38" width="2" height="60" class="f3"/><rect x="98.6" y="24" width="2" height="58" class="f3"/>')
    art.shaded(beam, depth=3, light=1.8, dark=2.4, grad='l')
    art.add('<path d="M40,30 L104,14 L104,17 L40,33 Z" class="f4"/>')
    for cx, cy in ((30, 102), (90, 86)):
        art.shaded(ellipse(cx, cy, 15, 11), depth=3, light=2, dark=2.8, transform=f'rotate(-22 {cx} {cy})',
                   glint=(cx - 6, cy - 4, 2.4, 4.4, -60))
    return art.svg()


def document():
    art = Art()
    page = 'M30,8 H80 L104,32 V112 Q104,120 96,120 H30 Q22,120 22,112 V16 Q22,8 30,8 Z'
    art.shaded(page, depth=4, light=2.6, dark=3.2, grad='l', glint=(30, 22, 2, 7, 0))
    art.add('<path d="M80,8 L104,32 H86 Q80,32 80,26 Z" class="f2"/><path d="M80,26 Q80,32 86,32 H104 L98,34 H84 Q78,32 80,26 Z" class="f1" opacity=".6"/>')
    for y, w in ((50, 60), (62, 66), (74, 52), (86, 64), (98, 40)):
        art.add(f'<rect x="34" y="{y}" width="{w}" height="5" rx="2.5" class="f1"/>')
    art.add('<rect x="34" y="34" width="30" height="7" rx="3.5" class="f2"/>')
    return art.svg()


def gear():
    art = Art()
    teeth = 8
    pts = []
    for i in range(teeth * 4):
        ang = math.radians(i * 360 / (teeth * 4) - 90 + 360 / (teeth * 8))
        r = 54 if (i % 4) in (1, 2) else 42
        pts.append(f'{64 + r * math.cos(ang):.1f},{64 + r * math.sin(ang):.1f}')
    outline = 'M' + ' L'.join(pts) + ' Z'
    hole = ellipse(64, 64, 15, 15)
    d = outline + ' ' + hole
    art.shaded(d, depth=4.5, light=2.6, dark=3.4, glint=(40, 30, 3, 7, -40), evenodd=True)
    art.add('<circle cx="64" cy="64" r="28" class="k1" stroke-width="2.4" fill="none" opacity=".7"/>',
            '<circle cx="64" cy="64" r="16.5" class="k0" stroke-width="3" fill="none"/>',
            '<path d="M51,58 A15,15 0 0 1 70,50" class="k3" stroke-width="2" fill="none"/>')
    return art.svg()


def question():
    art = Art()
    bubble = 'M64,10 C96,10 118,30 118,58 C118,86 96,104 66,104 C60,104 54,103 49,101 L24,116 L32,94 C18,85 10,72 10,58 C10,30 32,10 64,10 Z'
    art.shaded(bubble, depth=4, light=2.6, dark=3.4, glint=(32, 30, 3, 9, -50))
    art.add('<path d="M50,44 C50,32 58,27 65,27 C75,27 81,33 81,42 C81,52 70,54 66,61 L66,67" class="k0" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(1.5 1.5)" opacity=".5"/>',
            '<path d="M50,44 C50,32 58,27 65,27 C75,27 81,33 81,42 C81,52 70,54 66,61 L66,67" class="k4" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
            '<circle cx="67.5" cy="84.5" r="7" class="f0" opacity=".5"/><circle cx="66" cy="83" r="7" class="f4"/>')
    return art.svg()


def headphones():
    art = Art()
    art.add('<path d="M22,74 V60 C22,32 40,14 64,14 C88,14 106,32 106,60 V74" class="k0" stroke-width="13" fill="none" stroke-linecap="round" transform="translate(2 2)"/>',
            '<path d="M22,74 V60 C22,32 40,14 64,14 C88,14 106,32 106,60 V74" class="k2" stroke-width="11" fill="none" stroke-linecap="round"/>',
            '<path d="M22,58 C22,34 40,18 64,18" class="k4" stroke-width="2.4" fill="none" stroke-linecap="round" transform="translate(-2 -2)"/>',
            '<path d="M64,14 C88,14 106,32 106,60" class="k1" stroke-width="3" fill="none" transform="translate(1.4 2.6)" opacity=".7"/>')
    for x, flip in ((10, 1), (90, -1)):
        art.shaded(rr(x, 60, 28, 54, 12), depth=3, light=2.2, dark=3, glint=(x + 7, 70, 2, 7, 0))
        inner = x + 20 if flip > 0 else x - 2
        art.add(f'<path d="{rr(inner, 66, 10, 42, 5)}" class="f1"/><rect x="{inner + 2}" y="70" width="2" height="34" rx="1" class="f3"/>')
    return art.svg()


def clock():
    art = Art()
    art.shaded(ellipse(64, 66, 52, 52), depth=4, light=3, dark=3.8, glint=(34, 34, 4, 9, -45))
    art.shaded(ellipse(64, 66, 41, 41), depth=0, light=1.6, dark=2, grad='l')
    for i in range(12):
        ang = math.radians(i * 30)
        r1, r2 = (31, 37) if i % 3 == 0 else (34, 37)
        art.add(f'<line x1="{64 + r1 * math.sin(ang):.1f}" y1="{66 - r1 * math.cos(ang):.1f}" x2="{64 + r2 * math.sin(ang):.1f}" y2="{66 - r2 * math.cos(ang):.1f}" '
                f'class="k1" stroke-width="{3.4 if i % 3 == 0 else 2}" stroke-linecap="round"/>')
    art.add('<line x1="64" y1="66" x2="64" y2="38" class="k0" stroke-width="5" stroke-linecap="round"/>',
            '<line x1="64" y1="66" x2="84" y2="76" class="k0" stroke-width="5" stroke-linecap="round"/>',
            '<circle cx="64" cy="66" r="6" class="f2"/><circle cx="62.6" cy="64.6" r="2" class="fw" opacity=".85"/>')
    return art.svg()


ICONS = {
    'guitar': guitar, 'bass': bass, 'drums': drum_kit, 'beat': snare, 'percussion': maracas, 'keys': keyboard,
    'strings': violin, 'brass': trumpet, 'synth': synth, 'fx': sparkles, 'sparkle': sparkles, 'sample': microphone,
    'custom': faders, 'sound': speaker, 'library': books, 'song': notes, 'file': document, 'settings': gear,
    'help': question, 'headphones': headphones, 'clock': clock, 'recent': clock,
}

if __name__ == '__main__':
    arts = {name: fn() for name, fn in ICONS.items()}
    lines = ['// Generated by scripts/build-illustrations.py. Do not edit by hand: change the script and run it again.',
             '// Illustrated icons in one hue (tones of currentColor, see `.illo` in styles.css); ids start with ID_.',
             "import type { IconName } from './Icon';", '',
             'export const ILLUSTRATIONS: Partial<Record<IconName, string>> = {']
    for name, svg in arts.items():
        lines.append(f"  '{name}': `{svg}`,")
    lines.append('};')
    with open(os.path.join(ROOT, 'src/ui/illustrations.ts'), 'w') as handle:
        handle.write('\n'.join(lines) + '\n')

    # Visual check page: every icon large, on several skins, and at in-app sizes.
    css = open(os.path.join(ROOT, 'src/ui/illustrations.css')).read()
    skins = [('Midnight', '#151c2c', '#2ee6a6', '#e8ecf4'), ('Paper', '#fffaf0', '#5b5bd6', '#2a2438'),
             ('Neon', '#120f22', '#ff2e93', '#f4f0ff'), ('Amber', '#2a2117', '#f0b44d', '#f5ead7'), ('Candy', '#fffaff', '#d52f83', '#35172b')]
    family = {'guitar': '#a5d6a7', 'bass': '#80deea', 'drums': '#ff8a80', 'percussion': '#ffcc80', 'keys': '#80cbc4', 'strings': '#ce93d8',
              'brass': '#ffd54f', 'synth': '#90caf9', 'fx': '#b0bec5', 'sample': '#f48fb1', 'custom': '#c5e1a5'}
    shown = [n for n in ICONS if n not in ('sparkle', 'recent')]

    def inst(name, size, color, n=[0]):
        n[0] += 1
        return (f'<svg class="illo" viewBox="0 0 128 128" width="{size}" height="{size}" style="color:{color}">'
                f'{arts[name].replace("ID_", f"p{n[0]}_")}</svg>')

    font = os.environ.get('INTER_CSS', '')
    page = [f'<!doctype html><html><head><meta charset="utf-8">' + (f'<link rel="stylesheet" href="{font}">' if font else '') + f'<style>{css}'
            'body{margin:0;background:#0b0e15;color:#e8ecf4;font-family:Inter,system-ui,sans-serif}'
            '.sheet{padding:48px;display:grid;grid-template-columns:repeat(5,320px);gap:28px;width:max-content}'
            'h1{grid-column:1/-1;margin:0;font-size:24px}.tile{background:#151c2c;border-radius:22px;padding:16px;display:grid;gap:10px}'
            '.big{display:flex;justify-content:space-between;align-items:center}.row{display:flex;gap:6px}'
            '.row div{border-radius:10px;padding:5px;display:grid;place-items:center}.cap{font-size:15px;font-weight:600}'
            '.small{display:flex;gap:14px;align-items:center;margin-right:8px}</style></head><body><div class="sheet">'
            '<h1>Illustrated icons · soft gradient + cel shading · one hue each</h1>']
    for name in shown:
        main = family.get(name, '#2ee6a6')
        page.append(f'<div class="tile"><div class="cap">{name}</div><div class="big">{inst(name, 170, main)}'
                    f'<div class="small" style="flex-direction:column">{inst(name, 48, main)}{inst(name, 32, main)}{inst(name, 24, main)}</div></div><div class="row">')
        for skin, bg, accent, text in skins:
            page.append(f'<div style="background:{bg}">{inst(name, 34, accent)}</div>')
        page.append(f'<div style="background:#2ee6a6">{inst(name, 34, "#04281c")}</div></div></div>')
    page.append('</div></body></html>')
    os.makedirs(os.path.join(ROOT, 'docs/icons'), exist_ok=True)
    with open(os.path.join(ROOT, 'docs/icons/illustrations.html'), 'w') as handle:
        handle.write(''.join(page))
    print(f'{len(arts)} illustrations written')
