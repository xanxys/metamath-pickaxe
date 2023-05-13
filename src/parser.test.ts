import { ParseError, parseMM } from './parser';

test('parseMM succeeds for empty data', () => {
    expect(parseMM("")).toEqual({
        entries: [],
        beginLine: 1,
        endLine: 1,
    });
});

test("parseMM NG $f no vars", () => {
    const txt = `
    w $f a $.
    `;
    expect(() => parseMM(txt)).toThrow(ParseError);
});

test("parseMM NG $f too many vars", () => {
    const txt = `
    w $f a b b $.
    `;
    expect(() => parseMM(txt)).toThrow(ParseError);
});
