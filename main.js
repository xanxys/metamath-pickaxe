let codeMirror = CodeMirror(document.body, {
    lineNumbers: true,
});

fetch("/demo0.mm")
    .then((response) => response.text())
    .then((text) => codeMirror.setValue(text));
