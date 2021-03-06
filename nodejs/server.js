// server.js

// set up ======================================================================
// get all the tools we need
var express  = require('express');
var app      = express();
var port     = process.env.PORT || 8080;
var passport = require('passport');
var flash    = require('connect-flash');

var morgan       = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser   = require('body-parser');
var session      = require('express-session');

var sqlite3 = require('sqlite3').verbose();
var db;

var configDB = require('./config/database.js');
var conn_str = configDB.dbPath;

var common = require('./common');
var connMap = common.connMap;

var fs = require('fs');
var https = require('https');
var options = {
    key: fs.readFileSync('./ssl/server.key'),
    cert: fs.readFileSync('./ssl/server.crt'),
    ca: fs.readFileSync('./ssl/ca.crt'),
    requestCert: true,
    rejectUnauthorized: false
};

var WebSocketServer = require('ws').Server;
var ws = require('nodejs-websocket');

var property = {
  secure:true,
  key: fs.readFileSync('./ssl/server.key'),
  cert: fs.readFileSync('./ssl/server.crt'),
  ca: fs.readFileSync('./ssl/ca.crt'),
  requestCert: true,
  rejectUnauthorized: false
};

var server = ws.createServer(property, function (conn) {
    console.log("==== WebSocket Connection ====");
    console.log("New connection requested to: " + conn.path);
    console.log(conn.path);

    var connectionID = conn.path.substring(1);
    console.log(connectionID);
    connMap[1] = conn;

    conn.on('close', function (code, reason) {
        console.log("WebSocket connection closed");

    });

    // parse received text
    conn.on('text', function(str) {
        console.log('WebSocket received text');
	console.log(str);
        msg = JSON.parse(str);
	if(msg['type'] == "softwareUpdated"){
		console.log("Updated received");
    		var serverDB = new sqlite3.Database(conn_str);
		//query = 'UPDATE peers_connected set DevUpdate = 0 where PeerId = ?';
        //        serverDB.run(query, msg['peerId']);
	}
    });

    var deviceID;
  
    var serverDB = new sqlite3.Database(conn_str);
    serverDB.get('select UserName, PeerID from peers_connected where PeerID = ? AND serv_state = 4', connectionID, function(err, row) {

        console.log('DeviceID: ' + row.PeerID);
        if (!err && row != null) {
	    var query = 'INSERT OR IGNORE INTO devicesSocket (peerId,userName) VALUES ("' + row.PeerID + '","' + row.UserName + '")';
	    var peer_id = row.PeerID;

	    serverDB.run(query, function(err1,data){
		if(err1){
			console.log("error" + err1);
		}else{
			serverDB.get('select deviceId from devicesSocket where peerId = ?', peer_id, function (err2,data1){
				//query = 'UPDATE peers_connected set DevUpdate = 3 where PeerId = "' + peer_id + '"';
               // 		serverDB.run(query);
                        	if (data1 != undefined) {
                        		console.log("inserted: " + data1.deviceId);
                        		connMap[data1.deviceId] = conn;
                        	}	
                        	else {
                                	console.log('ERROR: ' + err);
                        	}

			});
		}

	    });
    }});

}).listen(9000);

app.use(express.static(__dirname + '/public'));

require('./config/passport')(passport); // pass passport for configuration

// set up our express application
app.use(morgan('dev')); // log every request to the console
app.use(cookieParser()); // read cookies (needed for auth)
app.use(bodyParser()); // get information from html forms

app.set('view engine', 'ejs'); // set up ejs for templating

// required for passport
app.use(session({ secret: 'herehereherehrehrerherherherherherherherhe' })); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session

// routes ======================================================================
require('./app/routes.js')(app, passport); // load our routes and pass in our app and fully configured passport

// launch ======================================================================
  db = new sqlite3.Database(conn_str);
  db.serialize(function() {
        db.run('DROP TABLE IF EXISTS roles');
        db.run('DROP TABLE IF EXISTS roleAccessLevel');
        db.run('DROP TABLE IF EXISTS fqdnACLevel');
        db.run('DROP TABLE IF EXISTS roleBasedAC');
        db.run('DROP TABLE IF EXISTS devicesSocket');
        //db.run('DROP TABLE IF EXISTS logs');
        //db.run('DROP TABLE IF EXISTS users');
  	//db.run('UPDATE OR IGNORE peers_connected set DevUpdate = 0');	
  	db.run('CREATE TABLE  IF NOT EXISTS devicesSocket ( deviceId INTEGER PRIMARY KEY AUTOINCREMENT, peerId TEXT, userName TEXT, UNIQUE(peerId));');	
  	db.run('CREATE TABLE  IF NOT EXISTS logs ( id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, srcMAC TEXT, src TEXT, dst TEXT, UNIQUE(srcMAC,dst));');	
  	db.run('CREATE TABLE  IF NOT EXISTS roles ( role_id INTEGER PRIMARY KEY, roleDesc TEXT);');	
	db.run('INSERT INTO roles VALUES (1,"Student")');
	db.run('INSERT INTO roles VALUES (2, "Professor")');
	db.run('INSERT INTO roles VALUES (3, "Admin")');
  	db.run('CREATE TABLE  IF NOT EXISTS roleAccessLevel ( id INTEGER PRIMARY KEY AUTOINCREMENT, role INTEGER, accessLevel INTEGER, FOREIGN KEY(role) REFERENCES roles(role_id));');
	db.run('INSERT INTO roleAccessLevel(role,accessLevel) VALUES (1, 1)');
	db.run('INSERT INTO roleAccessLevel(role,accessLevel) VALUES (2, 2)');
	db.run('INSERT INTO roleAccessLevel(role,accessLevel) VALUES (3, 4)');
	db.run('CREATE TABLE IF NOT EXISTS fqdnACLevel (id INTEGER PRIMARY KEY AUTOINCREMENT, fqdn TEXT, accessLevel INTEGER, FOREIGN KEY(accessLevel) REFERENCES roleAccessLevel(accessLevel))');
	db.run('INSERT INTO fqdnACLevel(fqdn,accessLevel) VALUES ("iot.aalto.fi", 2)');
	db.run('INSERT INTO fqdnACLevel(fqdn,accessLevel) VALUES ("guest.aalto.fi", 1)');
  	db.run('CREATE TABLE  IF NOT EXISTS roleBasedAC ( id INTEGER PRIMARY KEY AUTOINCREMENT, calledSID TEXT, fqdn TEXT, FOREIGN KEY (fqdn) REFERENCES fqdnACLevel(fqdn));');
	db.run('INSERT INTO roleBasedAC(calledSID,fqdn) VALUES ("6C-19-8F-83-C2-90:Noob2","iot.aalto.fi")');
	db.run('INSERT INTO roleBasedAC(calledSID,fqdn) VALUES ("6C-19-8F-83-C2-80:Noob1","guest.aalto.fi")');
	db.run('CREATE TABLE IF NOT EXISTS radius (called_st_id TEXT, calling_st_id  TEXT, NAS_id TEXT, user_name TEXT PRIMARY KEY);');	
  	db.run('CREATE TABLE  IF NOT EXISTS users ( id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, password TEXT, role INTEGER DEFAULT 1, isAdmin BOOLEAN DEFAULT FALSE,  FOREIGN KEY(role) REFERENCES roles(role_id) );');
  	db.run('CREATE TABLE  IF NOT EXISTS devices (PeerID TEXT, serv_state INTEGER, PeerInfo TEXT, Noob TEXT, Hoob TEXT, Hint TEXT,errorCode INTEGER ,UserName TEXT, PRIMARY KEY (PeerID, UserName));');
    db.run('CREATE TABLE IF NOT EXISTS UserDevices (Username TEXT,  PeerId TEXT);');
  	db.close();
  });

https.createServer(options, app).listen(8080, function () {
   console.log('Started!');
});


//app.listen(port);

//console.log('App is running on port ' + port);
