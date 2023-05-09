import { parseMM, DStmt, FStmt, EStmt, MMBlock, EntryType, CStmt, VStmt, AStmt, PStmt } from "./parser";

type FrameContext = {
    disjoints: DStmt[],
    hyps: Hypothesis[],
    varHyps: FStmt[],
    logiHyps: EStmt[],
};

function cloneFrameContext(ctx: FrameContext): FrameContext {
    return {
        disjoints: Array.from(ctx.disjoints),
        hyps: Array.from(ctx.hyps),
        varHyps: Array.from(ctx.varHyps),
        logiHyps: Array.from(ctx.logiHyps),
    };
}

// Either FStmt or EStmt
type Hypothesis = {
    label: string,
    typecode: string,
    symbols: string[],
    isLogi: boolean,
};

type ExtFrame = {
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
type MMDB = {
    constSymbols: Set<string>,
    varSymbols: Set<String>,
    extFrames: Map<string, ExtFrame>, // key is label
};

// Input data error at AST level.
class ASTError {
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
function organizeMM(outermostBlock: MMBlock): MMDB {
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
                currCtx.varHyps.push(stmt);
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
        varHyps: [],
        logiHyps: [],
    });
    return db;
}

function printStack(stack: string[][]) {
    console.log("====stack", stack.map((syms) => syms.join(" ")));
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
function verifyProof(db: MMDB, frame: ExtFrame): true | string {
    if (!frame.proofLabels) {
        throw new Error("frame must contain a proof");
    }

    const stack: string[][] = [];
    for (const label of frame.proofLabels) {
        const varHyp = frame.context.varHyps.filter((h) => h.label === label)[0];
        printStack(stack);
        console.log("applying", label);
        if (varHyp) {
            console.log("ref-var-hyp", varHyp);
            stack.push([varHyp.typecode, varHyp.symbol]);
            continue;
        }
        const logiHyp = frame.context.logiHyps.filter((h) => h.label === label)[0];
        if (logiHyp) {
            console.log("ref-logi-hyp", logiHyp);
            stack.push([logiHyp.typecode, ...logiHyp.symbols]);
            continue;
        }
        const assertion = db.extFrames.get(label);
        if (assertion) {
            const arity = assertion.mandatoryHyps.length;
            console.log("ref-assertion", "arity", arity, assertion);
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
            console.log("Trying to unify", hyps, "->", args);
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
            console.log(unifier);

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

        throw new Error(`Invalid frame, missing ${label}`);
    }

    return true;
}

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});


fetch("/demo0.mm") // maxNest 1
    //fetch("/big-unifier.mm") // maxNest 1
    //fetch("/set.mm") // maxNest 5
    //fetch("/iset.mm") // maxNest 4
    //fetch("/hol.mm") // maxNest 3
    .then((response) => response.text())
    .then((text) => {
        //        codeMirror.setValue(text);
        const ast = parseMM(text);
        const db = organizeMM(ast);
        for (const [label, frame] of db.extFrames.entries()) {
            console.log("ExtFrame", label, frame);
            if (!frame.proofLabels) {
                continue;
            }
            console.log("->", verifyProof(db, frame));
        }
    });
