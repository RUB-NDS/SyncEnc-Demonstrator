import Dialog from "./inputUserDialog";

export default class RemoveUserDialog extends Dialog{
    constructor(){
        super("removeUser");
    }

    /**
     * html string for adding the dialog dynamically
     * @returns {string} html string
     * @private
     */
    _htmlDialogString(){
        return '<div class="ql-dialog-removeUser">' +
            '    <dialog role="dialog" id="dialog-removeUser">' +
            '        <form>' +
            '            <label for="data-removeUser">Enter Username: </label>' +
            '            <input id="data-removeUser">' +
            '        </form>' +
            '        <button id="saveDialog-removeUser">remove</button>' +
            '        <button id="closeDialog-removeUser">close</button>' +
            '    </dialog>' +
            '</div>'
    }
}