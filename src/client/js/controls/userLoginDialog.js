import inputUserDialog from "./inputUserDialog";

export default class UserLoginDialog extends inputUserDialog {
    constructor() {
        super("login");
        this.request = UserLoginDialog.REQUEST.NONE;
    }

    showModal(request) {
        this.request = request;
        super.showModal();
    }

    /**
     * html string for adding the dialog dynamically
     * @returns {string} html string
     * @private
     */
    _htmlDialogString() {
        return '<div class="ql-dialog-login">' +
            '    <dialog role="dialog" id="dialog-login">' +
            '        <form>' +
            '            <label for="data-login">Enter Username: </label>' +
            '            <input id="data-login">' +
            '            <label for="password-login">Enter Password: </label>' +
            '            <input id="password-login" type="password">' +
            '        </form>' +
            '        <button id="saveDialog-login">ok</button>' +
            '        <button id="closeDialog-login">close</button>' +
            '    </dialog>' +
            '</div>'
    }

    get username() {
        return this.dialog.getElementsByTagName("input")[0].value;
    }

    get password() {
        return this.dialog.getElementsByTagName("input")[1].value;
    }
}

UserLoginDialog.REQUEST = {
    NONE: "none",
    PRIVATE_KEY: "privateKey",
    PUBLIC_KEY: "publicKey"
};
