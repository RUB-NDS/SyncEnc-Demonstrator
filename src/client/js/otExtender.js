import Module from 'quill/core/module';
import xmlEnc from 'xml-enc';
import shareDb from 'sharedb/lib/client';
import XmlWrapper from './xmlWrapper';
import Delta from 'quill-delta';
import AddUserDialog from './controls/addUserDialog'
import RemoveUserDialog from "./controls/removeUserDialog";

//register shareDB type for xml encryption
shareDb.types.register(xmlEnc.type);
var socket = new WebSocket('wss://' + window.location.host); //new socket
var connection = new shareDb.Connection(socket); //new connection

window.disconnect = function () {
    connection.close();
};

window.connect = function () {
    var socket = new WebSocket('wss://' + window.location.host);
    connection.bindToSocket(socket);
};

//allow different documents
let documentName = "test";
if(document.URL.indexOf('#') > 1){
    documentName = document.URL.substring(document.URL.indexOf('#') + 1, document.URL.length);
}

var doc = connection.get(documentName, 'xml-enc');

//subscribe the document
new Promise((resolve, reject) => {
    doc.subscribe(function (err) {
        if (err) {
            reject(err);
        } else {
            resolve(doc);
        }
    });
}).then((doc) => {
    //if the document has been loaded successfully
    if (doc.data === undefined)
        doc.create('<root><header><isEncrypted>false</isEncrypted></header><document></document></root>', 'xml-enc');
    let otExtender = window.quill.getModule('OtExtender');
    otExtender.shareDbDocumentLoaded(doc);
});

export class OtExtender extends Module {
    constructor(quill, options) {
        super(quill, options);
        this.quill = quill;
        this.options = options;
        this.xmlWrapper = null;
        this.shareDbDoc = null;
        this.encryptionButton = null;
        this.encAddUserButton = null;
        this.encDelUserButton = null;
        quill.on('text-change', this.update.bind(this));
        quill.enable(false);
        if (options.useStaticKeys !== undefined) {
            this.useStaticKeys = options.useStaticKeys;
        } else {
            this.useStaticKeys = false;
        }
        this.dialogs = {};
        this._initButtons();
        this.statusBar = document.querySelector(options.statusBar);
        this.disableButtons();
    }

    /**
     * Initializes the encrypt, add user and remove user button.
     * @private
     */
    _initButtons() {
        this.encryptionButton = document.querySelector('.ql-encryption');
        if (this.encryptionButton != null) {
            this.encryptionButton.addEventListener('click', this.encryptDocument.bind(this));
            //this.encryptionButton.style = "display: none;";
        }


        //init add user button for adding new users to the documents
        this.encAddUserButton = document.querySelector('.ql-encAddUser');
        if (this.encAddUserButton !== null) {
            //this.encAddUserButton.style = "display: none;";
            this.dialogs.encAddUserDialog = new AddUserDialog();
            this.dialogs.encAddUserDialog.addDialogToDocument(this.addUser.bind(this));
            this.encAddUserButton.addEventListener('click', () => {
                this.dialogs.encAddUserDialog.showModal();
            });
        }
        //init remove user button for removing users
        this.encDelUserButton = document.querySelector('.ql-encDelUser');
        if (this.encDelUserButton !== null) {
            //this.encDelUserButton.style = "display: none;";
            this.dialogs.encRemoveUserDialog = new RemoveUserDialog("encAddUserDialog");
            this.dialogs.encRemoveUserDialog.addDialogToDocument(this.removeUser.bind(this));
            this.encDelUserButton.addEventListener('click', () => {
                this.dialogs.encRemoveUserDialog.showModal();
            });
        }
    }

    /**
     * Function is called after the document was received from ShareDB
     * @param doc ShareDB document
     */
    shareDbDocumentLoaded(doc) {
        this.shareDbDoc = doc;
        this.xmlWrapper = new XmlWrapper(this.shareDbDoc, this.useStaticKeys);
        this.xmlWrapper.on(XmlWrapper.events.REMOTE_UPDATE, this.remoteUpdate.bind(this));
        //load the document in the xmlWrapper
        this.xmlWrapper.shareDbDocumentLoaded().then((res) => {
            window.quill.setContents(res.delta, 'api');
            this.encryptionChanged(res.isEncrypted);
            this.xmlWrapper.on(XmlWrapper.events.DOCUMENT_ENCRYPTION_CHANGED, this.encryptionChanged.bind(this));
            this.xmlWrapper.executeStoredDocumentOperations();
            this.enableButtons();
            window.quill.enable();
        });

        //enable remote updates from shareDB
        this.shareDbDoc.on('op', function (op, source) {
            if (source === 'quill') return;
            this.xmlWrapper.remoteUpdate(op);
        }.bind(this));
    }

    /**
     * Event function that is called if the text content of the quill editor has been changed
     * @param delta the change
     * @param oldDelta the old document before the change
     * @param source of the change (user, quill, api, etc.)
     */
    update(delta, oldDelta, source) {
        if (source !== 'user') return;
        console.log(delta);
        console.log(oldDelta);
        this.xmlWrapper.quillTextChanged(delta, doc).then(() => {
            console.log(doc.data);
        });
    }

    /**
     * Function that will be called if a remote update has been received
     * @param op remote update operation
     */
    remoteUpdate(op) {
        let delta = new Delta(op);
        this.quill.updateContents(delta);
    }

    /**
     * Encrypts the document
     */
    encryptDocument() {
        this.xmlWrapper.encryptDocument();
    }

    /**
     * Event that is called after the document encryption have been changed.
     * @param isEncrypted if the document is encrypted
     */
    encryptionChanged(isEncrypted) {
        if (this.statusBar !== null) {
            if (isEncrypted) {
                this.statusBar.style.backgroundColor = "green";
                this.statusBar.textContent = "encrypted";
            } else {
                this.statusBar.style.backgroundColor = "yellow";
                this.statusBar.textContent = "unencrypted";
            }
        }
        this.enableButtons();
    }

    /**
     * Add user handler. Receives the result of the add user dialog
     * @param dialog dialog
     */
    addUser(dialog) {
        if (dialog.action === AddUserDialog.ACTION.CLOSED)
            dialog.close();
        if (dialog.action === AddUserDialog.ACTION.SAVED) {
            console.log(dialog.value);
            this.xmlWrapper.addUserToDocument(dialog.value);
            dialog.close();
        }

    }

    /**
     * Remove user handler. Receives the result of the remove user dialog
     * @param dialog dialog
     */
    removeUser(dialog) {
        if (dialog.action === RemoveUserDialog.ACTION.CLOSED)
            dialog.close();
        if (dialog.action === RemoveUserDialog.ACTION.SAVED) {
            console.log(dialog.value);
            this.xmlWrapper.removeUserFromDocument(dialog.value);
            dialog.close();
        }
    }

    /**
     * sets the status bar to the given message and color
     * @param message of the status bar
     * @param color of the status bar
     */
    setStatusBarMessage(message, color) {
        if (this.statusBar !== null && this.statusBar !== undefined) {
            this.statusBar.style.backgroundColor = color;
            this.statusBar.textContent = message;
        }
    }

    /**
     * Disables all encryption buttons
     */
    disableButtons() {
        this.encryptionButton.style = OtExtender.BUTTON_STYLE.HIDDEN;
        this.encAddUserButton.style = OtExtender.BUTTON_STYLE.HIDDEN;
        this.encDelUserButton.style = OtExtender.BUTTON_STYLE.HIDDEN;
    }

    /**
     * Enables all encryption buttons based on the document setting
     */
    enableButtons() {
        if (this.xmlWrapper.headerSection.isEncrypted === true) {
            this.encryptionButton.style = OtExtender.BUTTON_STYLE.HIDDEN;
            this.encAddUserButton.style = OtExtender.BUTTON_STYLE.VISIBLE;
            this.encDelUserButton.style = OtExtender.BUTTON_STYLE.VISIBLE;
        } else {
            this.encryptionButton.style = OtExtender.BUTTON_STYLE.VISIBLE;
            this.encAddUserButton.style = OtExtender.BUTTON_STYLE.HIDDEN;
            this.encDelUserButton.style = OtExtender.BUTTON_STYLE.HIDDEN;
        }
    }

    /**
     * Enum that represents the style of the encryption buttons
     * @returns {{HIDDEN: string, VISIBLE: string}}
     * @constructor
     */
    static get BUTTON_STYLE() {
        return {
            HIDDEN: "display: none;",
            VISIBLE: ""
        }
    }
}

if (window.Quill) {
    window.Quill.register('modules/OtExtender', OtExtender);
}
