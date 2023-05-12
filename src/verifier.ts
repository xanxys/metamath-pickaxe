import { DStmt, FStmt, EStmt, MMBlock, EntryType, CStmt, VStmt, AStmt, PStmt } from "./parser";

export type FrameContext = {
    disjoints: DStmt[],
    hyps: Hypothesis[],
    logiHyps: EStmt[],
};

export function cloneFrameContext(ctx: FrameContext): FrameContext {
    return {
        disjoints: Array.from(ctx.disjoints),
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

    mandatoryHyps: Hypothesis[],
    proofLabels: string[] | null,
    proofCompressed: string | null,
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
                stmt.symbols.forEach((s) => db.constSymbols.add(s));
            } else if (ent.entryTy === EntryType.VS) {
                const stmt = ent.stmt as VStmt;
                stmt.symbols.forEach((s) => db.varSymbols.add(s));
            } else if (ent.entryTy === EntryType.FS) {
                const stmt = ent.stmt as FStmt;
                currCtx.hyps.push({
                    label: stmt.label,
                    typecode: stmt.typecode,
                    symbols: [stmt.symbol],
                    isLogi: false,
                });
            } else if (ent.entryTy === EntryType.ES) {
                const stmt = ent.stmt as EStmt;
                currCtx.logiHyps.push(stmt);
                currCtx.hyps.push({
                    label: stmt.label,
                    typecode: stmt.typecode,
                    symbols: stmt.symbols,
                    isLogi: true,
                });
            } else if (ent.entryTy === EntryType.DS) {
                const stmt = ent.stmt as DStmt;
                currCtx.disjoints.push(stmt);
            } else if (ent.entryTy === EntryType.AS) {
                const stmt = ent.stmt as AStmt;
                db.extFrames.set(stmt.label, {
                    context: cloneFrameContext(currCtx),
                    assertionLabel: stmt.label,
                    assertionLine: stmt.declLine,
                    assertionTypecode: stmt.typecode,
                    assertionSymbols: stmt.symbols,
                    mandatoryHyps: filterMandatoryHyps(currCtx.hyps, db, currCtx.logiHyps, stmt.symbols),
                    proofLabels: null,
                    proofCompressed: null,
                });
            } else if (ent.entryTy === EntryType.PS) {
                const stmt = ent.stmt as PStmt;
                db.extFrames.set(stmt.label, {
                    context: cloneFrameContext(currCtx),
                    assertionLabel: stmt.label,
                    assertionLine: stmt.declLine,
                    assertionTypecode: stmt.typecode,
                    assertionSymbols: stmt.symbols,
                    mandatoryHyps: filterMandatoryHyps(currCtx.hyps, db, currCtx.logiHyps, stmt.symbols),
                    proofLabels: stmt.proofLabels,
                    proofCompressed: stmt.proofCompressed,
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
        disjoints: [],
        hyps: [],
        logiHyps: [],
    });
    return db;
}


// Compressed proof is not just compression of label list, it's extension of stack machine operation to allow memory access.
// read discussion in https://groups.google.com/g/metamath/c/qIHf2h0fxbA
type ProofStackOp = {
    ty: ProofStackOpType,
    pushLabel: string | undefined,
    memoryIx: number | undefined,
};

enum ProofStackOpType {
    Push,
    Store,
    Load,
};

function decodeNormalProof(labels: string[]): ProofStackOp[] {
    const result: ProofStackOp[] = [];
    for (const label of labels) {
        result.push({
            ty: ProofStackOpType.Push,
            pushLabel: label,
            memoryIx: undefined,
        });
    }
    return result;
}

function decodeCompressedProof(compressedProof: string, mandatoryHypLabels: string[], optionalLabels: string[]): ProofStackOp[] {
    const result: ProofStackOp[] = [];
    let tempNum = 0;
    let memoryIx = 0;
    for (let i = 0; i < compressedProof.length; i++) {
        const n = compressedProof[i].charCodeAt(0) - "A".charCodeAt(0);
        if (n < 20) {
            // A-T
            const num = (tempNum * 20 + n);
            tempNum = 0;

            if (num < mandatoryHypLabels.length) {
                result.push({
                    ty: ProofStackOpType.Push,
                    pushLabel: mandatoryHypLabels[num],
                    memoryIx: undefined,
                });
            } else if (num < mandatoryHypLabels.length + optionalLabels.length) {
                result.push({
                    ty: ProofStackOpType.Push,
                    pushLabel: optionalLabels[num - mandatoryHypLabels.length],
                    memoryIx: undefined,
                });
            } else {
                const loadIx = num - mandatoryHypLabels.length - optionalLabels.length;
                if (loadIx >= memoryIx) {
                    throw new Error("Invalid compressed proof (referencing undefined subproof)");
                }
                result.push({
                    ty: ProofStackOpType.Load,
                    pushLabel: undefined,
                    memoryIx: loadIx,
                });
            }
        } else if (n < 25) {
            // U-Y
            tempNum = tempNum * 5 + (n - 20 + 1);
        } else if (n === 25) {
            // Z
            if (tempNum !== 0) {
                throw new Error("Invalid compressed proof (unexpected Z)");
            }
            result.push({
                ty: ProofStackOpType.Store,
                pushLabel: undefined,
                memoryIx: memoryIx,
            });
            memoryIx++;
        } else {
            throw new Error("Invalid compressed proof");
        }
    }
    return result;
}

function symSeqEqual(symSeqA: string[], symSeqB: string[]): boolean {
    if (symSeqA.length !== symSeqB.length) {
        return false;
    }
    for (let i = 0; i < symSeqA.length; i++) {
        if (symSeqA[i] !== symSeqB[i]) {
            return false;
        }
    }
    return true;
}



// Returns true is the proof is valid, otherwise failure reason string.
export function verifyProof(db: MMDB, frame: ExtFrame): true | string {
    if (!frame.proofLabels) {
        throw new Error("frame must contain a proof");
    }

    let decodedOps: ProofStackOp[] = [];
    if (!frame.proofCompressed) {
        decodedOps = decodeNormalProof(frame.proofLabels);
    } else {
        decodedOps = decodeCompressedProof(frame.proofCompressed, frame.mandatoryHyps.map((h) => h.label), frame.proofLabels);
    }

    const memory: Map<number, string[]> = new Map();
    const stack: string[][] = [];
    for (const op of decodedOps) {
        if (op.ty === ProofStackOpType.Store) {
            memory.set(op.memoryIx as number, stack[stack.length - 1]);
            continue;
        }
        if (op.ty === ProofStackOpType.Load) {
            stack.push(memory.get(op.memoryIx as number) as string[]);
            continue;
        }

        const label: string = op.pushLabel as string;
        var hyp = frame.context.hyps.filter((h) => h.label === label)[0];
        if (hyp) {
            stack.push([hyp.typecode, ...hyp.symbols]);
            continue;
        }

        const assertion = db.extFrames.get(label);
        if (assertion) {
            const arity = assertion.mandatoryHyps.length;
            if (arity === 0) {
                stack.push([assertion.assertionTypecode, ...assertion.assertionSymbols]);
                continue;
            }

            if (stack.length < arity) {
                return "Unification failed";
            }

            const args: string[][] = [];
            for (let i = 0; i < arity; i++) {
                args.push(stack.pop() as string[]);
            }
            args.reverse();

            const hyps = assertion.mandatoryHyps;
            const unifier = new Map<string, string[]>(); // key:variable, value:symbolSeq
            for (let i = 0; i < arity; i++) {
                // TODO: currently doing 1:1 matching, but actually variable can match sequence of symbols+, not just 1 symbol.
                // since vHyp is [typecode, var], it's trivial to find match.
                // What about logi hyp...????
                if (args[i].length < 1 + hyps[i].symbols.length) {
                    // TODO: is it ok to match var to 0 symbols?
                    return `Unification failed for hyp(1 typecode + ${hyps[i].symbols.length} symbols) -> ${args[i]}`;
                }
                if (args[i][0] !== hyps[i].typecode) {
                    return `Unification failed: typecode mismatch`;
                }
                const newUnification = args[i].slice(1);
                if (hyps[i].symbols.length === 1) {
                    const existingUnification = unifier.get(hyps[i].symbols[0]);
                    if (existingUnification !== undefined && !symSeqEqual(existingUnification, newUnification)) {
                        return `Unification failed: already assigned unifier ${existingUnification} contradicts newly required unification ${newUnification}`;
                    }
                    unifier.set(hyps[i].symbols[0], newUnification);
                } else {
                    // "easy" case: everything is already unified.
                    const matchTrial: string[] = [hyps[i].typecode];

                    hyps[i].symbols.forEach((sym) => {
                        if (db.varSymbols.has(sym)) {
                            const existingUnif = unifier.get(sym);
                            if (existingUnif === undefined) {
                                throw new Error("Needs generic seq->seq unification, but not implemented");
                            }
                            matchTrial.push(...existingUnif);
                        } else {
                            matchTrial.push(sym);
                        }
                    });

                    if (symSeqEqual(matchTrial, args[i])) {
                        continue;
                    } else {
                        console.log(matchTrial, "!=", args[i]);
                        return "Unification failed";
                    }
                }
            }

            // Push assertion with unifier.
            const symSeq: string[] = [assertion.assertionTypecode];
            for (const sym of assertion.assertionSymbols) {
                if (db.varSymbols.has(sym)) {
                    const unifiedSyms = unifier.get(sym);
                    if (unifiedSyms === undefined) {
                        return `Somehow unifier misses symbol contained in the assertion ${sym}`; // probably bug in the code, not proof
                    }
                    symSeq.push(...unifiedSyms);
                } else {
                    symSeq.push(sym);
                }
            }
            stack.push(symSeq);
            continue;
        }

        console.log(frame);
        throw new Error(`Invalid frame, missing ${label}`);
    }

    return true;
}
