var opn = require('opn');
var fs = require("fs");
var WebSocket = require('ws');
const http = require('http');
var ffmpeg = require('fluent-ffmpeg');
// const phantom = require('phantom');
var WebSocketServer = WebSocket.Server;

const HTTP_PORT = 1935;
const HTTP_HOST = '0.0.0.0';

var usersID = new Set();

var clients = {};

const handleRequest = function(request, response) {
	
	console.log('request received: ' + request.url);

	if (request.method === "POST" && request.url === "/streamMovie/") {
	    let body = '';
	    request.on('data', chunk => { body += chunk.toString(); });
	    request.on('end', () => {
	    	body = JSON.parse(body)
	    	var uuid = body["uuid"];
	    	var movie_id = body["movie_id"];

	        console.log(body);

			var movie_src = __dirname + "/movies/" + movie_id + ".mp4";

			fs.stat(movie_src, function(error, stats) {
				if(error){
					if(error.code==='ENOENT'){
						console.log("Error: File " + movie_src + " not found!");
						response.setHeader("Content-Type", "application/json");
						response.setHeader("Access-Control-Allow-Origin", "*");
						response.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
						response.setHeader("Status", 404); // file not found
						response.end(JSON.stringify({"response": "Movie not found"}));
						return response;
					}
				}
		        if(!usersID.has(uuid)){
	        		usersID.add(uuid);
	        		console.log("User session added to the server");
	        		response.setHeader("Content-Type", "application/json");
	        		response.setHeader("Access-Control-Allow-Origin", "*");
					response.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	        		response.writeHead(200);
	        		response.end(JSON.stringify({"response": "Movie found"}));
	        		loadServerPeerMovie(uuid, movie_id);
	        		return response;
	        	}else{
	        		console.log("User already has an open session with the server!");
	        		response.writeHead(404);
	        		response.end();
	        		return response;
	        	}
			});

	    });
	}
	
	if(request.method === "GET"){

		if(request.url === "/client.js"){
			response = setResponseHeaders(response);
			response.end(fs.readFileSync('./client.js'));
			return response;
		}

		/* Returns a list containing all of the movie available at the cdn */
		else if(request.url === '/movieList/'){ 
			movieList = []
			fs.readdir(__dirname + "/movies/", function(err, items) {
			    //console.log(items);	 
			    for (var i=0; i<items.length; i++) {
			    	if(items[i].split('.')[1] === 'mp4'){
			    		console.log(items[i]);
			        	movieList.push(items[i]);
			        }
			    }
				console.log(movieList);
				response = setResponseHeaders(response);
				response.end(JSON.stringify({"Movie_List:":  movieList}));
				return response;
			});
		}

		/* Returns a dictionary contaning the complete metadata of the movie file */
			else if(request.url.startsWith('/movieInfo/')){
			var seg_url = request.url.split('/');
			var movie_id = seg_url[2];	
			ffmpeg.ffprobe( __dirname + "/movies/" + movie_id + ".mp4" ,function(err, metadata) {
				response = setResponseHeaders(response);
				response.end(JSON.stringify({"Movie_Metadata":  metadata}));
				return response;
			});
		}

		/* Results a list containing the languages of the available subtitles for the requested movie */
		else if(request.url.startsWith('/subtitleInfo/')){
			var seg_url = request.url.split('/');
			var subtitle_id = seg_url[2];
			subtitleList =  [];
			fs.readdir(__dirname + "/movies/", function(err, items) {	 
			    for (var i=0; i<items.length; i++) {
			    	seg_name = items[i].split('.')
			    	if((seg_name[1] === 'vtt') && ((seg_name[0]).split("_")[0] === subtitle_id)){
			        	subtitleList.push(seg_name[0].split("_")[1]);
			        }
			    }
			    console.log(subtitleList);
				response = setResponseHeaders(response);
				response.end(JSON.stringify({"Subtitle_list":  subtitleList}));
				return response;
			});			
		}

		/* Subtitles section */ 
		/* Not operational, client browser never fetches (GET) the subtitles file :/ */
		else if(request.url.startsWith('/subtitles/')){
			var seg_url = request.url.split('/');
			var subtitles_src = __dirname + "/movies/" + seg_url[2];		
			fs.stat(subtitles_src, function(error, stats){
				if(error){
					if(error.code==='ENOENT'){
						response.setHeader("Content-Type", "application/json");
						response.setHeader("Access-Control-Allow-Origin", "*");
						response.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
						response.setHeader("Status", 404); // file not found
						response.end(JSON.stringify({"response": "Movie not found"}));
						console.log("ERROR");
						return response;
					}
				}else{
					response.setHeader("Access-Control-Allow-Origin", "*");
					response.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
					response = setResponseHeaders(response, "text/vtt");
					response.end(fs.readFileSync(subtitles_src));
					return response;
				}
			});			

		}
		else{
			response.setHeader("Status", 404);
			response.end();
			return response;		
		}

	}

};

const httpsServer = http.createServer(handleRequest);
httpsServer.listen(HTTP_PORT, HTTP_HOST);

// Create a server for handling websocket calls
const wss = new WebSocketServer({server: httpsServer});

wss.on("connection", (ws) => {
	console.log("Websocket connection open!");
	ws.on('message', function(message) {
		var msg = JSON.parse(message);

		console.log(msg);

		if(msg['sdp']){  
			if(msg.uuid === 0){ // message from server peer
				if(msg.sdp === 'server_peer_online'){
					console.log("Server peer added to client list");
					usersID.add(msg['uuid']);
					clients[msg['uuid']] = ws;
				}
				if(msg.sdp.type === 'answer'){
					console.log("Got server answer");
					var dst_uuid = msg.dst_uuid
					var src_uuid = msg.uuid;
					clients[dst_uuid].send(JSON.stringify({"sdp":msg.sdp, "uuid":src_uuid})); 
					console.log("Sent answer to client peer!");
				}

			}
			else if(usersID.has(msg['uuid'])){ // if request from user 

				if(msg.sdp.type='offer'){ // if received offer 
					if(msg.uuid != 0){ // offer client => server
						usersID.add(msg['uuid']);	
						clients[msg['uuid']] = ws; // add client socket 
						// relay offer to the server peer
						clients[0].send(JSON.stringify(msg));
					}else{ // offer server => client 

					}
				}
			}
		}else if(msg.ice) { 
			//console.log("Msg uuid: " + msg.uuid);
			if(msg.uuid !== undefined){
				if(msg.uuid === 0){ // server message => client peer
					clients[msg.dst_uuid].send(JSON.stringify({'ice' : msg.ice, 'uuid' : msg.uuid})); 
				}else{ // client => server peer
					clients[0].send(JSON.stringify(msg)); 
					console.log("client => server peer");
					console.log(JSON.stringify(msg));
				}		
			}else{
				console.log("Error: No UUID in ICE message. Aborting...");
			}
			
		}else{
			console.log("Message not of SDP type. Ignoring...");
			return;
		}
	});
});

console.log('Server running. https://localhost:' + HTTP_PORT);

if(process.argv[2] == "--headless")
	loadServerPeerHeadless();
else
	loadServerPeer();

function loadServerPeerHeadless(){
	console.log("Opening firefox in headless mode...");
	var exec = require('child_process').exec;
	function puts(error, stdout, stderr) { console.log(stdout) }
	exec("firefox server.html --headless", puts);		
}

function loadServerPeer(){
	/* Old implementation of opening server peer */
	console.log("Opening server peer web page");
	opn("./server.html").catch( error => {
		console.log(error);
	});	
	/*
	console.log("Opening firefox in headless mode...");
	var exec = require('child_process').exec;
	function puts(error, stdout, stderr) { console.log(stdout) }
	exec("firefox server.html", puts);	
	*/
}

function loadServerPeerMovie(uuid, movie_id){
	console.log("Loading movie " + movie_id + " to serve to peer " + uuid);
	if(clients[0]) clients[0].send(JSON.stringify({'load' : movie_id}));
}

// exit callback
function onExit(){
	// do app specific cleaning before exiting
	process.on('exit', function () {
		console.log(' Stopping server ...');
		process.emit('cleanup');
	});

	// catch ctrl+c event and exit normally
	process.on('SIGINT', function () {
		console.log('\nCtrl-C...');
		console.log(' Stopping server ...');
		closeServerPeer();
		process.exit(2);
	});

	//catch uncaught exceptions, trace, then exit normally
	process.on('uncaughtException', function(e) {
		console.log('Uncaught Exception...');
		console.log(e.stack);
		process.exit(99);
	});

}

function setResponseHeaders(response, content_type){
	if(content_type === undefined)
		response.setHeader("Content-Type", "application/json");
	else
		response.setHeader("Content-Type", content_type);
	// set cross origin headers
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	return response;
}

function closeServerPeer(){
	if(usersID.has(0)){
		console.log("Closing server peer page...");
		clients[0].send(JSON.stringify({'sdp' : 'end'}));	
	}
}

onExit();
