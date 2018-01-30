export default class AddUserDialog {

    /**
     * Initializes a new AddUserDialog with the given name. The name must be unique!
     * After initialization call addDialogToDocument().
     * @param name unique name
     */
    constructor(name) {
        this.name = name;
        this.dialog = null;
        this._action = AddUserDialog.ACTION.NO_ACTION;
    }

    /**
     * the dialog string used to generate a new dialog based on the name
     * @returns {string} a static string used to generate a new dialog
     * @private
     */
    static get _htmlDialogString() {
        return '<div class="ql-dialog-%NAME%">\n' +
            '    <dialog role="dialog" id="dialog-%NAME%">\n' +
            '        <form method="post">\n' +
            '            <label for="data-%NAME%">Enter Username:</label>\n' +
            '            <input id="data-%NAME%">\n' +
            '        </form>\n' +
            '        <button id="saveDialog-%NAME%">save</button>\n' +
            '        <button id="closeDialog-%NAME%">close</button>\n' +
            '    </dialog>\n' +
            '</div>'
    }

    /**
     * Adds the dialog to the document and sets the callback method for clicking on save or close.
     * Action can be used to determine if the user has clicked save or closed.
     * @param callback that handles the click on save or close
     */
    addDialogToDocument(callback) {
        let htmlString = AddUserDialog._htmlDialogString.replace(new RegExp("%NAME%", 'g'), this.name);
        let divElement = new DOMParser().parseFromString(htmlString, "text/html").getElementsByTagName("body")[0];
        let saveButton = divElement.getElementsByTagName("button")[0];

        saveButton.addEventListener('click', (() => {
            this._action = AddUserDialog.ACTION.SAVED;
            callback(this);
        }));

        let closeButton = divElement.getElementsByTagName("button")[1];
        closeButton.addEventListener('click', (() => {
            this._action = AddUserDialog.ACTION.CLOSED;
            callback(this);
        }));
        window.document.body.insertAdjacentElement('afterbegin', divElement);
        this.dialog = document.getElementById("dialog-" + this.name);
    }

    /**
     * shows the dialog
     */
    showModal() {
        this.dialog.showModal();
    }

    /**
     * closes the dialog
     */
    close() {
        this.dialog.getElementsByTagName("input")[0].value = "";
        this.dialog.close();
    }

    /**
     * returns the current value of the dialog. Value should be checked after clicking on save
     * @returns {*}
     */
    get value() {
        return this.dialog.getElementsByTagName("input")[0].value;
    }

    /**
     * returns the action of the dialog (close, save)
     * @returns {AddUserDialog.ACTION}
     */
    get action() {
        return this._action;
    }
}

AddUserDialog.ACTION = {
    CLOSED: "close",
    SAVED: "saved",
    NO_ACTION: "no-action"
};