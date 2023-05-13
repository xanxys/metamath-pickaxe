import { DStmt, FStmt, EStmt, MMBlock, EntryType, CStmt, VStmt, AStmt, PStmt } from "./parser";

// Represents variable disjointness restriction.
export class DVRestriction {
    pairs: Set<string> = new Set<string>(); // "a b", "b c", ...

    constructor() {
    }

    addPair(a: string, b: string) {
        if (a < b) {
            this.pairs.add(`${a} ${b}`);
        } else {
            this.pairs.add(`${b} ${a}`);
        }
    }

    add(stmt: DStmt) {
        const syms = stmt.symbols;
        for (let i = 0; i < syms.length; i++) {
            for (let j = i + 1; j < syms.length; j++) {
                this.addPair(syms[i], syms[j]);
            }
        }
    }

    clone(): DVRestriction {
        const result = new DVRestriction();
        result.pairs = new Set(this.pairs);
        return result;
    }

    extract(requiredSyms: string[]): DVRestriction {
        const result = new DVRestriction();
        for (const pair of this.pairs) {
            const [a, b] = pair.split(" ");
            if (requiredSyms.includes(a) && requiredSyms.includes(b)) {
                result.pairs.add(pair);
            }
        }
        return result;
    }

    substituteMultiple(subst: Map<string, string[]>): DVRestriction {
        const result = new DVRestriction();
        for (const pair of this.pairs) {
            const [a, b] = pair.split(" ");
            const aelems = subst.get(a);
            const belems = subst.get(b);
            if (!aelems || !belems) {
                throw new Error("Variable not found in substitution map");
            }
            for (const aelem of aelems) {
                for (const belem of belems) {
                    if (aelem === belem) {
                        throw new Error(`Variable ${aelem} cannot be disjoint with itself`);
                    }
                    result.addPair(aelem, belem);
                }
            }
        }
        return result;
    }

    satisfiedBy(other: DVRestriction): boolean {
        for (const rel of this.pairs) {
            if (!other.pairs.has(rel)) {
                return false;
            }
        }
        return true;
    }
}

export type FrameContext = {
    dvr: DVRestriction,
    hyps: Hypothesis[],
    logiHyps: EStmt[],
};

export function cloneFrameContext(ctx: FrameContext): FrameContext {
    return {
        dvr: ctx.dvr.clone(),
        hyps: Array.from(ctx.hyps),
        logiHyps: Array.from(ctx.logiHyps),
    };
}

// Either FStmt or EStmt
export type Hypothesis = {
    label: string,
    typecode: string,
    symbols: string[],
    isLogi: boolean,
};

export type ExtFrame = {
    context: FrameContext,

    assertionLabel: string,
    assertionTypecode: string,
    assertionSymbols: string[],
    assertionLine: number,

    mandatoryDvr: DVRestriction,
    mandatoryHyps: Hypothesis[],
    proofLabels: string[] | null,
    proofCompressed: (number | "Z")[] | null,
};

// See p.132 of metamath.pdf
export type MMDB = {
    constSymbols: Set<string>,
    varSymbols: Set<String>,
    extFrames: Map<string, ExtFrame>, // key is label
};

// Input data error at AST level.
export class ASTError {
    line: number;
    message: string;

    constructor(line: number, message: string) {
        this.line = line;
        this.message = message;
    }
}

function filterMandatoryHyps(hyps: Hypothesis[], db: MMDB, logiHyps: EStmt[], assertionSymbols: string[]): Hypothesis[] {
    const usedVars = new Set<string>();
    for (const logiHyp of logiHyps) {
        for (const symbol of logiHyp.symbols) {
            if (db.varSymbols.has(symbol)) {
                usedVars.add(symbol);
            }
        }
    }
    for (const symbol of assertionSymbols) {
        if (db.varSymbols.has(symbol)) {
            usedVars.add(symbol);
        }
    }
    return hyps.filter((hyp) => hyp.isLogi || usedVars.has(hyp.symbols[0]));
}

function parseCompressedProof(compressedProof: string, line: number): (number | "Z")[] {
    const result: (number | "Z")[] = [];
    let tempNum = 0;
    for (let i = 0; i < compressedProof.length; i++) {
        const n = compressedProof[i].charCodeAt(0) - "A".charCodeAt(0);
        if (n < 20) {
            // A-T
            const num = (tempNum * 20 + n);
            tempNum = 0;
            result.push(num);
        } else if (n < 25) {
            // U-Y
            tempNum = tempNum * 5 + (n - 20 + 1);
        } else if (n === 25) {
            // Z
            if (tempNum !== 0) {
                throw new ASTError(line, "Invalid compressed proof (unexpected Z)");
            }
            result.push("Z");
        } else {
            throw new Error(`Unexpected character ${compressedProof[i]} in compressed proof`);
        }
    }
    return result;
}

// throws ASTError.
export function createMMDB(outermostBlock: MMBlock): MMDB {
    const db: MMDB = {
        constSymbols: new Set(),
        varSymbols: new Set(),
        extFrames: new Map(),
    };

    function procBlock(block: MMBlock, outermost: boolean, outerCtx: FrameContext) {
        let currCtx = cloneFrameContext(outerCtx);

        for (const ent of block.entries) {
            if (ent.entryTy === EntryType.CS) {
                const stmt = ent.stmt as CStmt;
                if (!outermost) {
                    throw new ASTError(stmt.declLine, "$c can only appear in the outermost block");
                }
                stmt.symbols.forEach((s) => {
                    if (db.constSymbols.has(s) || db.varSymbols.has(s)) {
                        throw new ASTError(stmt.declLine, `"${s}" is already declared and cannot be re-declared`);
                    }
                    db.constSymbols.add(s);
                });
            } else if (ent.entryTy === EntryType.VS) {
                const stmt = ent.stmt as VStmt;
                stmt.symbols.forEach((s) => {
                    if (db.constSymbols.has(s) || db.varSymbols.has(s)) {
                        throw new ASTError(stmt.declLine, `"${s}" is already declared and cannot be re-declared`);
                    }
                    db.varSymbols.add(s);
                });
            } else if (ent.entryTy === EntryType.FS) {
                const stmt = ent.stmt as FStmt;
                if (!db.constSymbols.has(stmt.typecode)) {
                    throw new ASTError(stmt.declLine, `"${stmt.typecode}" must be a constant symbol, but it was not.`);
                }
                if (!db.varSymbols.has(stmt.symbol)) {
                    throw new ASTError(stmt.declLine, `"${stmt.symbol}" must be a constant symbol, but it was not.`);
                }
                if (currCtx.hyps.some((hyp) => hyp.label === stmt.label)) {
                    throw new ASTError(stmt.declLine, `label "${stmt.label}" is already declared`);
                }
                if (db.extFrames.has(stmt.label)) {
                    throw new ASTError(stmt.declLine, `label "${stmt.label}" is already declared`);
                }
                currCtx.hyps.push({
                    label: stmt.label,
                    typecode: stmt.typecode,
                    symbols: [stmt.symbol],
                    isLogi: false,
                });
            } else if (ent.entryTy === EntryType.ES) {
                const stmt = ent.stmt as EStmt;
                if (currCtx.hyps.some((hyp) => hyp.label === stmt.label)) {
                    throw new ASTError(stmt.declLine, `label "${stmt.label}" is already declared`);
                }
                if (db.extFrames.has(stmt.label)) {
                    throw new ASTError(stmt.declLine, `label "${stmt.label}" is already declared`);
                }
                currCtx.logiHyps.push(stmt);
                currCtx.hyps.push({
                    label: stmt.label,
                    typecode: stmt.typecode,
                    symbols: stmt.symbols,
                    isLogi: true,
                });
            } else if (ent.entryTy === EntryType.DS) {
                const stmt = ent.stmt as DStmt;
                currCtx.dvr.add(stmt);
            } else if (ent.entryTy === EntryType.AS) {
                const stmt = ent.stmt as AStmt;
                if (currCtx.hyps.some((hyp) => hyp.label === stmt.label)) {
                    throw new ASTError(stmt.declLine, `label "${stmt.label}" is already declared`);
                }
                if (db.extFrames.has(stmt.label)) {
                    throw new ASTError(stmt.declLine, `label "${stmt.label}" is already declared`);
                }
                db.extFrames.set(stmt.label, {
                    context: cloneFrameContext(currCtx),
                    assertionLabel: stmt.label,
                    assertionLine: stmt.declLine,
                    assertionTypecode: stmt.typecode,
                    assertionSymbols: stmt.symbols,
                    mandatoryDvr: currCtx.dvr.extract(stmt.symbols),
                    mandatoryHyps: filterMandatoryHyps(currCtx.hyps, db, currCtx.logiHyps, stmt.symbols),
                    proofLabels: null,
                    proofCompressed: null,
                });
            } else if (ent.entryTy === EntryType.PS) {
                const stmt = ent.stmt as PStmt;
                if (currCtx.hyps.some((hyp) => hyp.label === stmt.label)) {
                    throw new ASTError(stmt.declLine, `label "${stmt.label}" is already declared`);
                }
                if (db.extFrames.has(stmt.label)) {
                    throw new ASTError(stmt.declLine, `label "${stmt.label}" is already declared`);
                }
                db.extFrames.set(stmt.label, {
                    context: cloneFrameContext(currCtx),
                    assertionLabel: stmt.label,
                    assertionLine: stmt.declLine,
                    assertionTypecode: stmt.typecode,
                    assertionSymbols: stmt.symbols,
                    mandatoryDvr: currCtx.dvr.extract(stmt.symbols),
                    mandatoryHyps: filterMandatoryHyps(currCtx.hyps, db, currCtx.logiHyps, stmt.symbols),
                    proofLabels: stmt.proofLabels,
                    proofCompressed: stmt.proofCompressed === null ? null : parseCompressedProof(stmt.proofCompressed, stmt.declLine),
                });
            } else if (ent.entryTy === EntryType.Block) {
                procBlock(ent.block as MMBlock, false, currCtx);
            } else {
                console.log("Not implemented", ent);
                throw new Error("Not implemented: " + ent.entryTy);
            }
        }
    }

    procBlock(outermostBlock, true, {
        dvr: new DVRestriction(),
        hyps: [],
        logiHyps: [],
    });
    return db;
}
