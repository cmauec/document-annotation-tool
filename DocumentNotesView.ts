import { ItemView, WorkspaceLeaf, TextAreaComponent, ButtonComponent, MarkdownRenderer, MarkdownView, App } from 'obsidian';
import DocumentNotesPlugin from './main';

export const VIEW_TYPE_DOCUMENT_NOTES = 'document-notes-view';

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

export class DocumentNotesView extends ItemView {
    private plugin: DocumentNotesPlugin;
    private notesContainer: HTMLElement;
    private notes: Note[] = [];

    constructor(leaf: WorkspaceLeaf, plugin: DocumentNotesPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_DOCUMENT_NOTES;
    }

    getDisplayText(): string {
        return 'Document Notes';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();

        // Create new note button
        const buttonContainer = container.createDiv('button-container');
        const newNoteButton = new ButtonComponent(buttonContainer)
            .setButtonText('Nueva Nota')
            .onClick(() => this.createNewNote());

        // Container for notes
        this.notesContainer = container.createDiv('notes-container');

        await this.refresh();
    }

    private async createNewNote(
        selectedText?: string,
        selectionStart?: { line: number; ch: number },
        selectionEnd?: { line: number; ch: number }
    ) {
        const note: Note = {
            id: Date.now().toString(),
            content: '',
            createdAt: Date.now(),
            selectedText,
            selectionStart,
            selectionEnd
        };

        this.notes.unshift(note);
        await this.plugin.saveNotes(this.notes);
        await this.renderNotes();
    }

    private async renderNotes() {
        this.notesContainer.empty();

        for (const note of this.notes) {
            const noteDiv = this.notesContainer.createDiv('note-container');

            // Display creation date
            const dateDiv = noteDiv.createDiv('note-date');
            const date = new Date(note.createdAt);
            dateDiv.setText(date.toLocaleString('es-ES', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }));

            // If there is selected text, display it
            if (note.selectedText) {
                const selectedTextDiv = noteDiv.createDiv('selected-text');
                const header = selectedTextDiv.createEl('h6', { text: 'Selected Text:' });
                const textContent = selectedTextDiv.createDiv('selected-text-content');
                await MarkdownRenderer.renderMarkdown(
                    note.selectedText,
                    textContent,
                    '',
                    this
                );
            }

            // Create text area for the note
            const textArea = new TextAreaComponent(noteDiv);
            textArea
                .setPlaceholder('Escribe tu nota aquí...')
                .setValue(note.content)
                .onChange(async (value) => {
                    note.content = value;
                    note.createdAt = Date.now();
                    await this.plugin.saveNotes(this.notes);
                });

            // Action buttons
            const buttonContainer = noteDiv.createDiv('note-buttons');

            // Button to go to selection
            if (note.selectedText && note.selectionStart) {
                const gotoButton = new ButtonComponent(buttonContainer)
                    .setButtonText('Ir a selección')
                    .onClick(async () => {
                        try {
                            // Check if we have all necessary information
                            if (!note.selectionStart || !note.selectionEnd || !note.selectedText) {
                                new Notice('Información de selección incompleta');
                                return;
                            }

                            // Get target file
                            const targetPath = this.plugin.getCurrentFilePath();
                            if (!targetPath) {
                                new Notice('No se pudo encontrar la ruta del archivo original');
                                return;
                            }

                            const targetFile = await this.plugin.getFileByPath(targetPath);
                            if (!targetFile) {
                                new Notice(`No se pudo encontrar el archivo: ${targetPath}`);
                                return;
                            }

                            // Open file in a new leaf if not active
                            const leaf = this.app.workspace.getMostRecentLeaf();
                            if (!leaf) {
                                new Notice('No se pudo obtener una hoja de trabajo');
                                return;
                            }

                            await leaf.openFile(targetFile, { active: true });

                            // Wait for file to open and editor to be available
                            let view = null;
                            let attempts = 0;
                            while (!view && attempts < 10) {
                                view = this.app.workspace.getActiveViewOfType(MarkdownView);
                                if (!view) {
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                    attempts++;
                                }
                            }

                            if (!view) {
                                new Notice('No se pudo acceder al editor');
                                return;
                            }

                            const editor = view.editor;
                            if (!editor) {
                                new Notice('No se pudo acceder al editor del documento');
                                return;
                            }

                            // Make sure positions are within document range
                            const docLength = editor.lineCount();
                            if (note.selectionStart.line >= docLength) {
                                new Notice('La posición de selección está fuera del documento');
                                return;
                            }

                            // Move cursor and scroll
                            editor.setCursor(note.selectionStart);
                            editor.scrollIntoView({
                                from: note.selectionStart,
                                to: note.selectionEnd
                            }, true);

                            // Highlight selection
                            editor.setSelection(note.selectionStart, note.selectionEnd);

                            // Dar feedback visual
                            new Notice('Navegado a la selección');
                        } catch (error) {
                            console.error('Error al navegar:', error);
                            new Notice(`Error al navegar: ${error.message}`);
                        }
                    });
            }

            // Button to delete note
            const deleteButton = new ButtonComponent(buttonContainer)
                .setButtonText('Eliminar')
                .onClick(async () => {
                    this.notes = this.notes.filter(n => n.id !== note.id);
                    await this.plugin.saveNotes(this.notes);
                    await this.renderNotes();
                });
        }
    }

    async refresh() {
        const notes = await this.plugin.getNotesForCurrentFile();
        if (notes) {
            this.notes = notes.sort((a, b) => b.createdAt - a.createdAt);
            await this.renderNotes();
        } else {
            this.notes = [];
            this.notesContainer.empty();
        }
    }

    async onClose() {
        // Nothing to clean up
    }
} 