class XmlHeaderSection {
    constructor(header) {
        this.header = header;
    }

    get isEncrypted() {
        return true;
    }

    setDocumentKey() {
        let testKey = window.Helper.base64ToArrayBuffer("hbhLKRaju+Y4Vq6cTyxfE0AaAwnBZPzr5qIxSoknYO4=");
        return window.crypto.subtle.importKey("raw", testKey, {
            name: "AES-GCM"
        }, true, ["encrypt", "decrypt"]);
    }
}

export default XmlHeaderSection;