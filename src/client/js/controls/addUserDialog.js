import Dialog from "./inputUserDialog";

export default class AddUserDialog extends Dialog{

    /**
     * Initializes a new AddUserDialog.
     */
    constructor() {
        super("addUser");
    }

    /**
     * html string for adding the dialog dynamically
     * @returns {string} html string
     * @private
     */
    _htmlDialogString() {
        return '<div class="ql-dialog-addUser">\n' +
            '    <dialog role="dialog" id="dialog-addUser">\n' +
            '        <form method="post">\n' +
            '            <label for="data-addUser">Enter Username:</label>\n' +
            '            <input id="data-addUser">\n' +
            '        </form>\n' +
            '        <button id="saveDialog-addUser">save</button>\n' +
            '        <button id="closeDialog-addUser">close</button>\n' +
            '    </dialog>\n' +
            '</div>'
    }
}