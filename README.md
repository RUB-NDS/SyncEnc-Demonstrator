# Quill module for collaborative encrypted working
This project extends the rich-text editor quill by a module for collaborative end-to-end encryption.
## Run application
install npm

    apt-get install npm

create installation folder %installdir% and clone the xml-enc plugin for sharedb

    mkdir %installdir%
    cd %installdir%
    git clone https://github.com/RUB-NDS/ottype-xml-enc.git
clone the quill with encryption repository

    git clone https://github.com/RUB-NDS/dpreikschat-syncenc.git
install ottype-xml-enc

    cd ottype-xml-enc
    npm install
    cd ..
install quill with encryption

    cd dpreikschat-syncenc
    npm install
  
start project 

    npm start
   go to http://localhost:3000
## Run Tests
Follow the steps of "Run application"
start test server

    npm run startTestServer
go to http://localhost:8080 to run the tests