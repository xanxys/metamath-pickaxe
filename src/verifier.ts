import { MMDB, ExtFrame } from "./analyzer";

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

function decodeCompressedProof(compressedProof: (number | "Z")[], mandatoryHypLabels: string[], optionalLabels: string[]): ProofStackOp[] {
    const result: ProofStackOp[] = [];
    let memoryIx = 0;
    for (const rawOp of compressedProof) {
        if (rawOp === "Z") {
            result.push({
                ty: ProofStackOpType.Store,
                pushLabel: undefined,
                memoryIx: memoryIx,
            });
            memoryIx++;
        } else {
            const num = rawOp;
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

            const unifierVarOnly: Map<string, string[]> = new Map();
            for (const [k, syms] of unifier) {
                unifierVarOnly.set(k, syms.filter((sym) => db.varSymbols.has(sym)));
            }

            assertion.mandatoryDvr.substituteMultiple(unifierVarOnly)

            const assertionDVInProofVars = assertion.mandatoryDvr.substituteMultiple(unifierVarOnly);
            if (!assertionDVInProofVars.satisfiedBy(frame.context.dvr)) {
                // console.log(unifier);
                // console.log(assertion, frame);
                // console.log(relevantAssertionDisjoints, frame.context.disjoints);
                return `Disjointness requirement of referenced assertion ${assertion.assertionLabel} is not satisfied by proof context`;
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

    if (stack.length !== 1) {
        return `Excess or missing proof steps`;
    }
    if (!symSeqEqual(stack[0], [frame.assertionTypecode, ...frame.assertionSymbols])) {
        return `Proven symbol sequence "${stack[0]}" does not match assertion "${frame.assertionSymbols}"`;
    }

    return true;
}
