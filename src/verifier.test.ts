import { parseMM } from './parser';
import { ExtFrame, MMDB, createMMDB, verifyProof } from './verifier';

test('verifyProof single', () => {
    const txt = `
    $c wff $.
    $v x $.
    wx $f wff x $.

    proof $p wff x $= wx $.
    `;

    const db = createMMDB(parseMM(txt));
    expect(verifyProof(db, db.extFrames.get("proof")!)).toBe(true);
});

test('verifyProof extra step', () => {
    const txt = `
    $c wff $.
    $v x $.
    wx $f wff x $.

    proof $p wff x $= wx wx $.
    `;

    const db = createMMDB(parseMM(txt));
    expect(verifyProof(db, db.extFrames.get("proof")!)).not.toBe(true);
});

test('verifyProof demo/normal', () => {
    const txt = `
    $c 0 + = -> ( ) term wff |- $.
    $v t r s P Q $.
    tt $f term t $.
    tr $f term r $.
    ts $f term s $.
    wp $f wff P $.
    wq $f wff Q $.
    tze $a term 0 $.
    tpl $a term ( t + r ) $.
    weq $a wff t = r $.
    wim $a wff ( P -> Q ) $.

    a1 $a |- ( t = r -> ( t = s -> r = s ) ) $.
    a2 $a |- ( t + 0 ) = t $.
    \${
       min $e |- P $.
       maj $e |- ( P -> Q ) $.
       mp  $a |- Q $.
    \$}
    th1 $p |- t = t $=
       tt tze tpl tt weq tt tt weq tt a2 tt tze tpl
       tt weq tt tze tpl tt weq tt tt weq wim tt a2
       tt tze tpl tt tt a1 mp mp
     $.
    `;
    const db = createMMDB(parseMM(txt));
    expect(verifyProof(db, db.extFrames.get("th1")!)).toBe(true);
});

test('verifyProof demo/compressed', () => {
    const txt = `
    $c 0 + = -> ( ) term wff |- $.
    $v t r s P Q $.
    tt $f term t $.
    tr $f term r $.
    ts $f term s $.
    wp $f wff P $.
    wq $f wff Q $.
    tze $a term 0 $.
    tpl $a term ( t + r ) $.
    weq $a wff t = r $.
    wim $a wff ( P -> Q ) $.

    a1 $a |- ( t = r -> ( t = s -> r = s ) ) $.
    a2 $a |- ( t + 0 ) = t $.
    \${
       min $e |- P $.
       maj $e |- ( P -> Q ) $.
       mp  $a |- Q $.
    \$}
    th1 $p |- t = t $=
      ( tze tpl weq a2 wim a1 mp ) ABCZADZAADZAEZJJKFLIAAGHH $.
    `;
    const db = createMMDB(parseMM(txt));
    expect(verifyProof(db, db.extFrames.get("th1")!)).toBe(true);
});

test('verifyProof disjoint OK', () => {
    const txt = `
    $c != term |- $. $v x y $. vx $f term x $. vy $f term y $.
    \${
      $d x y $.
      ax.d $a |- x != y $.
    \$}
    \${
      $d x y $.
      p.d $p |- y != x $= vy vx ax.d $.
    \$}
    `;
    const db = createMMDB(parseMM(txt));
    expect(verifyProof(db, db.extFrames.get("p.d")!)).toBe(true);
});

test('verifyProof disjoint missing', () => {
    const txt = `
    $c != term |- $. $v x y $. vx $f term x $. vy $f term y $.
    \${
      $d x y $.
      ax.d $a |- x != y $.
    \$}
    \${
      p.d $p |- y != x $= vy vx ax.d $.
    \$}
    `;
    const db = createMMDB(parseMM(txt));
    expect(verifyProof(db, db.extFrames.get("p.d")!)).not.toBe(true);
});
