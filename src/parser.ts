type Token = {
    text: string;
    line: number; // 1-origin
};

function tokenize(text: string): Token[] {
    const lines = text.split(/\r?\n/);
    const tokens: Token[] = [];
    let lineIx = 1;
    for (const line of lines) {
        for (const preToken of line.split(/\s+/)) {
            if (preToken.length > 0) {
                tokens.push({ text: preToken, line: lineIx });
            }
        }
        lineIx += 1;
    }
    return tokens;
}

function removeOptionals(tokens: Token[]): Token[] {
    enum State {
        Normal,
        Comment,
    }
    const result: Token[] = [];

    let state = State.Normal;
    for (const token of tokens) {
        if (state === State.Normal) {
            if (token.text === "$(") {
                state = State.Comment;
            } else {
                result.push(token);
            }
        } else if (state === State.Comment) {
            if (token.text === "$)") {
                state = State.Normal;
            }
        }
    }
    return result;
}

// Input data error at tokenizer/parser level.
export class ParseError {
    line: number;
    message: string;

    constructor(line: number, message: string) {
        this.line = line;
        this.message = message;
    }
}

// $c statements
export type CStmt = {
    symbols: string[],
    declLine: number,
};

// $v statements
export type VStmt = {
    symbols: string[],
    declLine: number,
};

// $a statements (axiom assertions)
export type AStmt = {
    label: string,
    typecode: string,
    symbols: string[],
    declLine: number,
};

// $p statements (proof assertions)
export type PStmt = {
    label: string,
    typecode: string,
    symbols: string[],
    proofLabels: string[],
    proofCompressed: string | null,
    declLine: number,
};

// $d statements 
export type DStmt = {
    symbols: string[],
    declLine: number,
};

// $f statement
export type FStmt = {
    label: string,
    typecode: string,
    symbol: string,
    declLine: number,
};

// $e statement
export type EStmt = {
    label: string,
    typecode: string,
    symbols: string[],
    declLine: number,
};

export enum EntryType {
    // statement
    CS, VS, AS, PS, DS, FS, ES,
    // block
    Block,
}

export type MMBlockEntry = {
    entryTy: EntryType,
    stmt: CStmt | VStmt | AStmt | PStmt | DStmt | FStmt | EStmt | null,
    block: MMBlock | null,
};

export type MMBlock = {
    entries: MMBlockEntry[],
    beginLine: number, // inclusive
    endLine: number, // inclusive
};

function parseSymbol(revTokens: Token[]): string {
    const tok = revTokens.pop();
    if (!tok || tok.text.startsWith("$")) {
        throw new ParseError(tok!.line, `Unexpected token ${tok?.text}, expected symbol`);
    }
    return tok.text;
}

function parseLabel(revTokens: Token[]): string {
    const tok = revTokens.pop();
    if (!tok || !/^[-._A-Za-z0-9]+$/.test(tok!.text)) {
        throw new ParseError(tok!.line, `Expected label, found ${tok!.text}`);
    }
    return tok.text;
}

function parseCompressedProofFragment(revTokens: Token[]): string {
    const tok = revTokens.pop();
    if (!tok || !/^[A-Z]+$/.test(tok!.text)) {
        throw new ParseError(tok!.line, `Expected compressed proof, found "${tok!.text}"`);
    }
    return tok.text;
}


function parseCStmt(revTokens: Token[]): CStmt {
    const token = revTokens.pop();
    const stmt: CStmt = {
        symbols: [],
        declLine: token!.line,
    };

    while (true) {
        const token = revTokens[revTokens.length - 1];
        if (token.text === "$.") {
            revTokens.pop();
            break;
        } else {
            stmt.symbols.push(parseSymbol(revTokens));
        }
    }
    return stmt;
}

function parseVStmt(revTokens: Token[]): VStmt {
    const token = revTokens.pop();
    const stmt: VStmt = {
        symbols: [],
        declLine: token!.line,
    };

    while (true) {
        const token = revTokens[revTokens.length - 1];
        if (token.text === "$.") {
            revTokens.pop();
            break;
        } else {
            stmt.symbols.push(parseSymbol(revTokens));
        }
    }
    return stmt;
}

function parseDStmt(revTokens: Token[]): DStmt {
    const token = revTokens.pop();
    const stmt: DStmt = {
        symbols: [],
        declLine: token!.line,
    };

    while (true) {
        const token = revTokens[revTokens.length - 1];
        if (token.text === "$.") {
            revTokens.pop();
            break;
        } else {
            stmt.symbols.push(parseSymbol(revTokens));
        }
    }
    return stmt;
}

function parseFStmt(revTokens: Token[]): FStmt {
    const tokLabel = revTokens.pop();
    revTokens.pop(); // $f
    const tokTypecode = revTokens.pop();
    const tokVar = revTokens.pop();
    const tokEnd = revTokens.pop();
    if (tokEnd?.text !== "$.") {
        throw new ParseError(tokLabel!.line, "$. expected");
    }
    if (!tokVar) {
        throw new ParseError(tokLabel!.line, "Unexpected end of file in $v");
    }
    return {
        label: tokLabel!.text,
        typecode: tokTypecode!.text,
        symbol: tokVar.text,
        declLine: tokLabel!.line,
    };
}

function parseAStmt(revTokens: Token[]): AStmt {
    const tokLabel = revTokens.pop();
    revTokens.pop(); // $a
    const tokTypecode = revTokens.pop();
    const stmt: AStmt = {
        label: tokLabel!.text,
        typecode: tokTypecode!.text,
        symbols: [],
        declLine: tokLabel!.line,
    };

    while (true) {
        const token = revTokens[revTokens.length - 1];
        if (token.text === "$.") {
            revTokens.pop();
            break;
        } else {
            stmt.symbols.push(parseSymbol(revTokens));
        }
    }
    return stmt;
}

function parseEStmt(revTokens: Token[]): EStmt {
    const tokLabel = revTokens.pop();
    revTokens.pop(); // $e
    const tokTypecode = revTokens.pop();
    const stmt: EStmt = {
        label: tokLabel!.text,
        typecode: tokTypecode!.text,
        symbols: [],
        declLine: tokLabel!.line,
    };

    while (true) {
        const token = revTokens[revTokens.length - 1];
        if (token.text === "$.") {
            revTokens.pop();
            break;
        } else {
            stmt.symbols.push(parseSymbol(revTokens));
        }
    }
    return stmt;
}


function parsePStmt(revTokens: Token[]): PStmt {
    const tokLabel = revTokens.pop();
    revTokens.pop(); // $p
    const tokTypecode = revTokens.pop();
    const stmt: PStmt = {
        label: tokLabel!.text,
        typecode: tokTypecode!.text,
        symbols: [],
        proofLabels: [],
        proofCompressed: null,
        declLine: tokLabel!.line,
    };

    while (true) {
        const token = revTokens[revTokens.length - 1];
        if (token.text === "$=") {
            revTokens.pop();
            break;
        } else {
            stmt.symbols.push(parseSymbol(revTokens));
        }
    }
    // TODO: $= ? $.case

    const token = revTokens[revTokens.length - 1];
    if (token.text === "(") {
        // compressed proof
        revTokens.pop();

        while (true) {
            const token = revTokens[revTokens.length - 1];
            if (token.text === ")") {
                revTokens.pop();
                break;
            } else {
                stmt.proofLabels.push(parseLabel(revTokens));
            }
        }

        let compressedProof = "";
        while (true) {
            const token = revTokens[revTokens.length - 1];
            if (token.text === "$.") {
                revTokens.pop();
                break;
            } else {
                compressedProof += parseCompressedProofFragment(revTokens);
            }
        }
        stmt.proofCompressed = compressedProof;
    } else {
        // non-compressed proof
        while (true) {
            const token = revTokens[revTokens.length - 1];
            if (token.text === "$.") {
                revTokens.pop();
                break;
            } else {
                stmt.proofLabels.push(parseLabel(revTokens));
            }
        }
    }
    return stmt;
}

function parseNestedBlock(revTokens: Token[]): MMBlock {
    const tokBegin = revTokens.pop(); // ${
    const block: MMBlock = {
        entries: [],
        beginLine: tokBegin!.line,
        endLine: tokBegin!.line
    };

    while (true) {
        const tok = revTokens[revTokens.length - 1];
        if (tok.text === "$}") {
            revTokens.pop();
            block.endLine = tok.line;
            break;
        } else {
            block.entries.push(parseEntry(revTokens));
        }
    }
    return block;
}

function parseEntry(revTokens: Token[]): MMBlockEntry {
    const tok = revTokens[revTokens.length - 1];
    if (tok.text === "$c") {
        return {
            entryTy: EntryType.CS,
            stmt: parseCStmt(revTokens),
            block: null,
        };
    } else if (tok.text === "$v") {
        return {
            entryTy: EntryType.VS,
            stmt: parseVStmt(revTokens),
            block: null,
        };
    } else if (tok.text === "$d") {
        return {
            entryTy: EntryType.DS,
            stmt: parseDStmt(revTokens),
            block: null,
        };
    } else if (tok.text === "${") {
        return {
            entryTy: EntryType.Block,
            stmt: null,
            block: parseNestedBlock(revTokens),
        };
    } else if (tok.text.startsWith("$")) {
        throw new ParseError(tok.line, "Unknown statement: " + tok.text);
    } else {
        const nextTok = revTokens[revTokens.length - 2];
        if (!nextTok) {
            throw new ParseError(tok.line, "Unexpected end of file after label");
        }

        if (nextTok.text === "$f") {
            return {
                entryTy: EntryType.FS,
                stmt: parseFStmt(revTokens),
                block: null,
            };
        }
        else if (nextTok.text === "$a") {
            return {
                entryTy: EntryType.AS,
                stmt: parseAStmt(revTokens),
                block: null,
            };
        } else if (nextTok.text === "$e") {
            return {
                entryTy: EntryType.ES,
                stmt: parseEStmt(revTokens),
                block: null,
            };
        } else if (nextTok.text === "$p") {
            return {
                entryTy: EntryType.PS,
                stmt: parsePStmt(revTokens),
                block: null,
            };
        } else {
            throw new ParseError(tok.line, `Unknown statement "${nextTok.text}" (with label "${tok.text}")`);
        }
    }
}

// can throw ParseError
export function parseMM(text: string): MMBlock {
    const eofHack = "$end of file$"; // cannot appear as normal token, because this string contains whitespaces
    const tokens = removeOptionals(tokenize(text));

    const revTokens = Array.from(tokens);
    revTokens.push({ text: eofHack, line: tokens[tokens.length - 1].line });
    revTokens.reverse();

    const entries: MMBlockEntry[] = [];
    while (revTokens.length > 0 && revTokens[revTokens.length - 1].text !== eofHack) {
        entries.push(parseEntry(revTokens));
    }

    return {
        entries: entries,
        beginLine: tokens[0].line,
        endLine: tokens[tokens.length - 1].line,
    };
}
