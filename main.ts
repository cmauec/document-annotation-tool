import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile } from 'obsidian';
import { DocumentNotesView, VIEW_TYPE_DOCUMENT_NOTES } from './DocumentNotesView';

interface Note {
    id: string;
    content: string;
    createdAt: number;
    selectedText?: string;
    selectionStart?: {
        line: number;
        ch: number;
    };
    selectionEnd?: {
        line: number;
        ch: number;
    };
}

interface DocumentNotes {
    documentPath: string;
    notes: Note[];
}

export default class DocumentNotesPlugin extends Plugin {
    private readonly notesFolder = 'document-notes';
    private originalDocumentPath: string = '';

    async onload() {
        // Registrar la vista del panel lateral
        this.registerView(
            VIEW_TYPE_DOCUMENT_NOTES,
            (leaf) => new DocumentNotesView(leaf, this)
        );

        // Agregar el comando para mostrar el panel
        this.addCommand({
            id: 'show-document-notes',
            name: 'Show Document Notes',
            callback: () => this.activateView()
        });

        // Crear la carpeta de notas si no existe
        await this.ensureNotesFolder();

        // Activar la vista al inicio
        this.activateView();

        // Suscribirse al evento de cambio de archivo activo
        this.registerEvent(
            this.app.workspace.on('file-open', () => {
                this.refreshView();
            })
        );

        // Agregar comando para crear nota desde selección
        this.addCommand({
            id: 'create-note-from-selection',
            name: 'Create Note from Selection',
            editorCallback: (editor) => this.createNoteFromSelection(editor)
        });

        // Agregar opción al menú contextual
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor) => {
                if (editor.getSelection()) {
                    menu.addItem((item) => {
                        item
                            .setTitle('Create Note from Selection')
                            .setIcon('note-glyph')
                            .onClick(() => this.createNoteFromSelection(editor));
                    });
                }
            })
        );
    }

    async ensureNotesFolder() {
        const folderExists = await this.app.vault.adapter.exists(this.notesFolder);
        if (!folderExists) {
            await this.app.vault.createFolder(this.notesFolder);
        }
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(VIEW_TYPE_DOCUMENT_NOTES)[0];

        if (!leaf) {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_DOCUMENT_NOTES,
                active: true,
            });
        }

        workspace.revealLeaf(leaf);
    }

    async refreshView() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DOCUMENT_NOTES);
        for (const leaf of leaves) {
            const view = leaf.view as DocumentNotesView;
            await view.refresh();
        }
    }

    async getNotesForCurrentFile(): Promise<Note[] | null> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return null;

        const fileId = activeFile.path.replace(/[\/\\:]/g, '_');
        const notePath = `${this.notesFolder}/${fileId}.json`;

        try {
            const noteContent = await this.app.vault.adapter.read(notePath);
            const documentNotes = JSON.parse(noteContent) as DocumentNotes;
            this.originalDocumentPath = documentNotes.documentPath;
            return documentNotes.notes;
        } catch {
            return null;
        }
    }

    async saveNotes(notes: Note[]) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        this.originalDocumentPath = activeFile.path;

        const fileId = activeFile.path.replace(/[\/\\:]/g, '_');

        const documentNotes: DocumentNotes = {
            documentPath: activeFile.path,
            notes: notes
        };

        const notePath = `${this.notesFolder}/${fileId}.json`;
        await this.app.vault.adapter.write(notePath, JSON.stringify(documentNotes, null, 2));
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_DOCUMENT_NOTES);
    }

    async createNoteFromSelection(editor: Editor) {
        const selectedText = editor.getSelection();
        if (selectedText) {
            // Obtener las posiciones exactas de inicio y fin
            const cursorStart = editor.getCursor('from');
            const cursorEnd = editor.getCursor('to');

            const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_DOCUMENT_NOTES)[0]?.view as DocumentNotesView;
            if (view) {
                await view.createNewNote(selectedText,
                    { line: cursorStart.line, ch: cursorStart.ch },
                    { line: cursorEnd.line, ch: cursorEnd.ch }
                );
                new Notice('Note created from selection');
            }
        }
    }

    getCurrentFilePath(): string {
        return this.originalDocumentPath;
    }

    async getFileByPath(path: string): Promise<TFile | null> {
        console.log('Buscando archivo en:', path);
        const file = this.app.vault.getAbstractFileByPath(path);
        console.log('Archivo encontrado:', file);
        if (file instanceof TFile) {
            return file;
        }
        return null;
    }
} 