"use strict";

const noteEditor = (function() {
    const treeEl = $("#tree");
    const noteTitleEl = $("#note-title");
    const noteDetailEl = $('#note-detail');
    const protectButton = $("#protect-button");
    const unprotectButton = $("#unprotect-button");
    const noteDetailWrapperEl = $("#note-detail-wrapper");
    const encryptionPasswordDialogEl = $("#protected-session-password-dialog");
    const encryptionPasswordEl = $("#protected-session-password");

    let currentNote = null;

    let noteChangeDisabled = false;

    let isNoteChanged = false;

    function getCurrentNote() {
        return currentNote;
    }

    function getCurrentNoteId() {
        return currentNote ? currentNote.detail.note_id : null;
    }

    function getCurrentNoteLoadTime() {
        return currentNote ? currentNote.loadTime : null;
    }

    function noteChanged() {
        if (noteChangeDisabled) {
            return;
        }

        isNoteChanged = true;
    }

    async function reload() {
        // no saving here

        await loadNoteToEditor(getCurrentNoteId());
    }

    async function switchToNote(noteId) {
        if (getCurrentNoteId() !== noteId) {
            await saveNoteIfChanged();

            await loadNoteToEditor(noteId);
        }
    }

    async function saveNoteIfChanged() {
        if (!isNoteChanged) {
            return;
        }

        const note = noteEditor.getCurrentNote();

        updateNoteFromInputs(note);

        await saveNoteToServer(note);
    }

    function parseHtml(contents, note) {
        note.links = [];
        note.images = [];

        note.detail.note_text = contents;

        if (!note.detail.is_protected) {
            const linkRegexp = /<a[^>]+?href="[^"]*app#([A-Za-z0-9]{22})"[^>]*?>[^<]+?<\/a>/g;
            let match;

            while (match = linkRegexp.exec(contents)) {
                console.log("adding link for " + match[1]);

                note.links.push({
                    note_id: note.detail.note_id,
                    target_note_id: match[1]
                });
            }
        }
    }

    function updateNoteFromInputs(note) {
        const contents = noteDetailEl.summernote('code');

        parseHtml(contents, note);

        const title = noteTitleEl.val();

        treeUtils.getNodeByKey(note.detail.note_id).setTitle(title);

        note.detail.note_title = title;
    }

    async function saveNoteToServer(note) {
        await $.ajax({
            url: baseApiUrl + 'notes/' + note.detail.note_id,
            type: 'PUT',
            data: JSON.stringify(note),
            contentType: "application/json",
            error: () => {
                showError("Error saving the note!");
            }
        });

        isNoteChanged = false;

        showMessage("Saved!");
    }

    function createNewTopLevelNote() {
        let rootNode = treeEl.fancytree("getRootNode");

        createNote(rootNode, "root", "into");
    }

    let newNoteCreated = false;

    async function createNote(node, parentKey, target, isProtected) {
        // if isProtected isn't available (user didn't enter password yet), then note is created as unencrypted
        // but this is quite weird since user doesn't see where the note is being created so it shouldn't occur often
        if (!isProtected || !protected_session.isProtectedSessionAvailable()) {
            isProtected = false;
        }

        const newNoteName = "new note";

        const result = await $.ajax({
            url: baseApiUrl + 'notes/' + parentKey + '/children' ,
            type: 'POST',
            data: JSON.stringify({
                note_title: newNoteName,
                target: target,
                target_note_id: node.key,
                is_protected: isProtected
            }),
            contentType: "application/json"
        });

        const newNode = {
            title: newNoteName,
            key: result.note_id,
            note_id: result.note_id,
            is_protected: isProtected,
            extraClasses: isProtected ? "protected" : ""
        };

        glob.allNoteIds.push(result.note_id);

        newNoteCreated = true;

        if (target === 'after') {
            node.appendSibling(newNode).setActive(true);
        }
        else {
            node.addChildren(newNode).setActive(true);

            node.folder = true;
            node.renderTitle();
        }

        showMessage("Created!");
    }

    function setTreeBasedOnProtectedStatus(note) {
        const node = treeUtils.getNodeByKey(note.detail.note_id);
        node.toggleClass("protected", note.detail.is_protected);
    }

    function setNoteBackgroundIfProtected(note) {
        if (note.detail.is_protected) {
            $(".note-editable").addClass("protected");
            protectButton.hide();
            unprotectButton.show();
        }
        else {
            $(".note-editable").removeClass("protected");
            protectButton.show();
            unprotectButton.hide();
        }

        setTreeBasedOnProtectedStatus(note);
    }

    async function loadNoteToEditor(noteId) {
        currentNote = await $.get(baseApiUrl + 'notes/' + noteId);

        if (newNoteCreated) {
            newNoteCreated = false;

            noteTitleEl.focus().select();
        }

        await protected_session.ensureProtectedSession(currentNote.detail.is_protected, false);

        noteDetailWrapperEl.show();

        // this may fal if the dialog has not been previously opened
        try {
            encryptionPasswordDialogEl.dialog('close');
        }
        catch(e) {}

        encryptionPasswordEl.val('');

        noteTitleEl.val(currentNote.detail.note_title);

        noteChangeDisabled = true;

        // Clear contents and remove all stored history. This is to prevent undo from going across notes
        noteDetailEl.summernote('reset');

        noteDetailEl.summernote('code', currentNote.detail.note_text);

        document.location.hash = noteId;

        recentNotes.addRecentNote(noteId, currentNote.detail.note_id);

        noteChangeDisabled = false;

        setNoteBackgroundIfProtected(currentNote);

        showAppIfHidden();
    }

    async function loadNote(noteId) {
        const note = await $.get(baseApiUrl + 'notes/' + noteId);

        return note;
    }

    $(document).ready(() => {
        noteTitleEl.on('input', () => {
            noteChanged();
        });

        noteDetailEl.summernote({
            airMode: true,
            height: 300,
            callbacks: {
                onChange: noteChanged
            }
        });

        // so that tab jumps from note title (which has tabindex 1)
        $(".note-editable").attr("tabindex", 2);
    });

    setInterval(saveNoteIfChanged, 5000);

    return {
        reload,
        switchToNote,
        saveNoteIfChanged,
        updateNoteFromInputs,
        saveNoteToServer,
        createNewTopLevelNote,
        createNote,
        setNoteBackgroundIfProtected,
        setTreeBasedOnProtectedStatus,
        loadNoteToEditor,
        loadNote,
        getCurrentNote,
        getCurrentNoteId,
        getCurrentNoteLoadTime
    };
})();