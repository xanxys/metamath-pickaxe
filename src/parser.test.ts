import { parseMM } from './parser';

test('parseMM succeeds for empty data', () => {
    expect(parseMM("")).toEqual({
        entries: [],
        beginLine: 1,
        endLine: 1,
    });
});
