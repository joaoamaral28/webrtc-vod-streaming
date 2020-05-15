
var SERVER_HOST = "localhost"
var SERVER_PORT = 1935;

var peerConnectionConfig = {
  'iceServers': [
    {'urls': 'stun:stun.stunprotocol.org:3478'},
    {'urls': 'stun:stun.l.google.com:19302'},
  ]
};

var constraints = {
    video: true,
    audio: true,
};

var serverConnection;
var peerConnection;
var localStream;
var uuid = 0;
var peer_uuid;

var receiveChannel;

var video;
var recording_video;

var dataChannel;

// Firefox 1.0+
var isFirefox = typeof InstallTrigger !== 'undefined';

// Chrome 1+
var isChrome = !!window.chrome && !!window.chrome.webstore;

function pageReady(){

	video = document.getElementById('sourceVideoPlayer');
	recording_video = document.getElementById('recordingVideoPlayer');

	serverConnection = new WebSocket("ws://"+SERVER_HOST+":"+SERVER_PORT);

	serverConnection.onopen = function(evt) {
    	console.log("Socket open");
    	console.log(evt);
    	serverConnection.send(JSON.stringify({'sdp': 'server_peer_online', 'uuid': uuid }));
    };

    serverConnection.onmessage = processMessage;

    /*
	if(navigator.mediaDevices.getUserMedia) {
		navigator.mediaDevices.getUserMedia(constraints).then(getUserMediaSuccess).catch(errorHandler);
	} else {
		alert('Your browser does not support getUserMedia API');
	}
	*/

}

function processMessage(msg){

	var msg = JSON.parse(msg.data);

	if(msg.sdp === "end"){
		serverConnection.close();
		console.log("Closing...");
	}

	if(msg.sdp){

		peer_uuid = msg.uuid;

		console.log("Peer uuid: " + peer_uuid);

		if(msg.sdp) {
			if(peerConnection === undefined){ // if no peer connection created 
				peerConnection = new RTCPeerConnection(constraints); // create new peer connection
				peerConnection.onicecandidate = gotIceCandidate;
				peerConnection.ondatachannel = receiveChannelCallback;
			}
			peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(function() {
				if(msg.sdp.type == 'offer') { // Only create answers in response to offers
				
					if(video.src){
						//captureStream();
						//getUserMedia();
						addTracks();
						//addStream();

					}

					peerConnection.createAnswer().then(createdDescription).catch(errorHandler);
				}
			}).catch(errorHandler);		
		}
	}

	else if(msg.ice) {
		console.log("got new ICE candidate");
		peerConnection.addIceCandidate(new RTCIceCandidate(msg.ice)).catch(errorHandler);
	}

	if(msg['load']){
		loadPlayerSrc(msg['load']);
	}

}

function loadPlayerSrc(movie_id){
	console.log("Loading video player src as " + movie_id + ".mp4");
	console.log(video);
	video.src = "./movies/"+movie_id+".mp4";

	//captureStream(); /* -- only to be called after WebRTC session is established between the peers */
	
	newCaptureStream();
}

function newCaptureStream(){

	var capture;

	if(isFirefox)	capture = video.mozCaptureStream();
	//else if (isChrome) capture = video.captureStream();
	//else{ console.log("Web browser does not support media capture"); return; };

	console.log(capture);

	// recording_video.srcObject = capture;
	localStream = capture;

	video.play();
}

function addTracks(){
	console.log(localStream);
	
	/*if(isFirefox)
		localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
	else
		peerConnection.addStream(localStream);
	*/
	// peerConnection.addStream(localStream);
	
	localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

	console.log("Tracks added to client RTCPeerConnection !");
}

/*
function addStream(){
	peerConnection.addStream(localStream);
}
*/


async function getUserMedia(){
	const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
	localStream = stream;
	console.log("getUserMedia local stream");
	console.log(localStream);
}

function captureStream(){

	/*
	video.addEventListener('canplay', () => {
		capture = video.mozCaptureStream();
		recording_video.srcObject = capture;
		peerConnection.addStream(capture);
		console.log("CANPLAY: Local recording started");
		console.log(capture);
	});
	*/

	video.addEventListener('play', () => {

		cosole.log("<<<< play Event listener");

		var capture;

		if(isFirefox)
			capture = video.mozCaptureStream();
		else
			capture = video.captureStream();

		capture.ontrack = newTrack;

		console.log(capture);

		recording_video.srcObject = capture;
		localStream = capture;

		// add MediaStream capture to peerConnection
		capture.getTracks().forEach(track => peerConnection.addTrack(track, capture));

		//peerConnection.addStream(capture); /** deprecated **/

		//console.log("Local recording started");
		
	});

	//const stream = navigator.mediaDevices.getUserMedia({audio: true, video: true});

	//stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

	video.play();

}

function gotIceCandidate(event) {
	if(event.candidate != null) {
		serverConnection.send(JSON.stringify({'ice': event.candidate, 'uuid': uuid, 'dst_uuid' : peer_uuid}));
	}
}

function createdDescription(description) {
	console.log('got description');
	peerConnection.setLocalDescription(description).then(function() {
		var msg = { 'sdp': peerConnection.localDescription, 'uuid' : uuid, 'dst_uuid' : peer_uuid };
		serverConnection.send(JSON.stringify(msg));
		console.log(msg);
	}).catch(errorHandler);
}

function errorHandler(error) {
  console.log(error);
}

function newTrack(event){
	console.log(event);
	console.log("new track added!");
}

function receiveChannelCallback(event) {
    receiveChannel = event.channel;
    receiveChannel.onmessage = handleReceiveMessage;
    receiveChannel.onopen = handleReceiveChannelStatusChange;
    receiveChannel.onclose = handleReceiveChannelStatusChange;
}

function handleReceiveMessage(event) {

	switch(event.data){
		case "pause":
			console.log(">>> Client requested pause!");
			video.pause();
			break;
		case "resume":
			console.log(">>> Client requested play!");
			video.play();
			break;
	}
}

function handleReceiveChannelStatusChange(event){
	if (receiveChannel) {
		console.log(">>>>>> Receive channel's status has changed to " + receiveChannel.readyState);
	}
}