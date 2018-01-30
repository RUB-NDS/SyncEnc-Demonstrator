import AddUserDialog from "./addUserDialog";

export default class Dialog{
    constructor(name){
        this.name = name;
        this.dialog = null;
        this._action = AddUserDialog.ACTION.NO_ACTION;
    }

    /**
     * html string for adding the dialog dynamically, should be overwritten by inheriting class.
     * @returns {string} html string
     * @private
     */
    _htmlDialogString(){
    }

    /**
     * Adds the dialog to the document and sets the callback method for clicking on save or close.
     * Action can be used to determine if the user has clicked save or closed.
     * @param callback that handles the click on save or close
     */
    addDialogToDocument(callback) {
        let divElement = new DOMParser().parseFromString(this._htmlDialogString(), "text/html").getElementsByTagName("body")[0];
        let saveButton = divElement.getElementsByTagName("button")[0];

        saveButton.addEventListener('click', (() => {
            this._action = Dialog.ACTION.SAVED;
            callback(this);
        }));

        let closeButton = divElement.getElementsByTagName("button")[1];
        closeButton.addEventListener('click', (() => {
            this._action = Dialog.ACTION.CLOSED;
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

Dialog.ACTION = {
    CLOSED: "close",
    SAVED: "saved",
    NO_ACTION: "no-action"
};