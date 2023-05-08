function tokenize(text: string) {
    const lines = text.split(/\r?\n/);
    const tokens = [];
    let lineIx = 1;
    for (const line of lines) {
        for (const preToken of line.split(/\s+/)) {
            if (preToken.length > 0) {
                tokens.push({ token: preToken, line: lineIx });
            }
        }
        lineIx += 1;
    }
    return tokens;
}


function parseMM(text: string) {
    const tokens = tokenize(text);
    console.log(tokens);
}

declare const CodeMirror: any;

let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});

fetch("/demo0.mm")
    .then((response) => response.text())
    .then((text) => {
        codeMirror.setValue(text);
        parseMM(text);
    });
