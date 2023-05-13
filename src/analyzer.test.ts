import { parseMM } from './parser';
import { createMMDB, ASTError } from './analyzer';

test("createMMDB NG double def $c", () => {
    const txt = `
    $c a $.
    $c a $.
    `;
    expect(() => createMMDB(parseMM(txt))).toThrow(ASTError);
});

test("createMMDB NG double def $v", () => {
    const txt = `
    $v a $.
    $v a $.
    `;
    expect(() => createMMDB(parseMM(txt))).toThrow(ASTError);
});

test("createMMDB NG overlapping $c & $v", () => {
    const txt = `
    $c a $.
    $v a $.
    `;
    expect(() => createMMDB(parseMM(txt))).toThrow(ASTError);
});

test.each([
    ["$f", "$f"], ["$f", "$e"], ["$f", "$a"], ["$f", "$p"],
    ["$e", "$e"], ["$e", "$a"], ["$e", "$p"],
    ["$a", "$a"], ["$a", "$p"],
    ["$p", "$p"]
])("createMMDB NG double def label %s-%s", (l1, l2) => {
    const txt = `
    $c a $.
    $v b $.
    th0 $a a b $.
    th ${l1} a b ${l1 === "$p" ? " $= th0 $." : "$."}
    th ${l2} a b ${l2 === "$p" ? " $= th0 $." : "$."}
    `;
    expect(() => createMMDB(parseMM(txt))).toThrow(ASTError);
});

test("createMMDB OK double def $e in different nest", () => {
    const txt = `
    $c a $.
    $v b $.
    \${
      th $e a b $.
    \$}
    \${
      th $e a b $.
    \$}
    `;
    expect(() => createMMDB(parseMM(txt))).not.toThrow(ASTError);
});

test("createMMDB OK $f", () => {
    const txt = `
    $c a $.
    $v b $.
    w $f a b $.
    `;
    const db = createMMDB(parseMM(txt));
    expect(db.constSymbols).toContain("a");
    expect(db.varSymbols).toContain("b");
    expect(db.extFrames.size).toBe(0);
});

test("createMMDB NG $f typecode is var", () => {
    const txt = `
    $c a $.
    $v b c $.
    w $f b c $.
    `;
    expect(() => createMMDB(parseMM(txt))).toThrow(ASTError);
});

test("createMMDB NG $f var is const", () => {
    const txt = `
    $c a b $.
    $v c $.
    w $f a b $.
    `;
    expect(() => createMMDB(parseMM(txt))).toThrow(ASTError);
});
