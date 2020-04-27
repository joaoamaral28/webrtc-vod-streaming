
var SERVER_HOST = "localhost"
var SERVER_PORT = 1935;

var serverConnection;
var peerConnection;
var localStream;
var uuid;
var player;

var sendChannel;

var peerConnectionConfig = {
  'iceServers': [
    {'urls': 'stun:stun.stunprotocol.org:3478'},
    {'urls': 'stun:stun.l.google.com:19302'},
  ]
};

const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

uuid = createUUID(); // unique identifier to distinguish users at the server
console.log("User UUID: " + uuid);

function showPlayer(){
    var playerDiv = document.getElementById("playerDiv");
    if (playerDiv.style.display === "none") {
        playerDiv.style.display = "block";
    } else {
        playerDiv.style.display = "none";
    }
}

function playerSetup(){

	// get movie id from url, not the best approach but will do for now
	var movie_id = window.location.href.split("/");

	console.log("Movie id:" + movie_id[movie_id.length-1]);

    checkMovieAvailable(1);

}

function checkMovieAvailable(movie_id){

    var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {   
        
        if (xmlHttp.readyState == 4){ // if successfuly sent
            if(xmlHttp.status == 200){
                console.log("Response: " + xmlHttp.response);
                showPlayer();
                fetchSubtitlesList(1);
                initWebRTCPeerSession();
            }
            else{
                alert("Movie not found!");
            }
        }
    }

    xmlHttp.open("POST", "http://" + SERVER_HOST + ":" + SERVER_PORT + "/streamMovie/", true);
    xmlHttp.send(JSON.stringify({"uuid" : uuid, "movie_id" : movie_id}));

}

function fetchSubtitlesList(id){
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {   
        if (xmlHttp.readyState == 4){ // if successfuly sent
            if(xmlHttp.status == 200){
                console.log("Response: " + xmlHttp.response);
                subtitle_list = JSON.parse(xmlHttp.response)["Subtitle_list"];
                subtitle_list.forEach( item => {
                    console.log(item);

                    track = document.createElement("track");
                    track.kind = "captions";
                    track.label = item
                    track.srclang = item;
                    track.src = "http://" + SERVER_HOST + ":" + SERVER_PORT + "/subtitles/" + id + "_" + item + ".vtt";
                    if(item === subtitle_list[0])
                        track.default = true;

                    var video = document.getElementById("player");

                    console.log(video);

                    video.appendChild(track);

                    track.mode = "showing";
                    video.textTracks[0].mode = "showing";

                    track.addEventListener("load", function() {
                        console.log("LOAD");
                        this.mode = "showing";
                        video.textTracks[0].mode = "showing"; // thanks Firefox
                    }, false);

                });
                
            }
            else{
                console.log("No subtitle tracks found for movie " + id);
            }
        }
    }

    xmlHttp.open("GET", "http://" + SERVER_HOST + ":" + SERVER_PORT + "/subtitleInfo/" + id, true);
    xmlHttp.send();

}

function initWebRTCPeerSession(){

    console.log("Initating WebRTC Peer Connection...");

    player = document.getElementById("player");
    setPlayerHandlers();

    serverConnection = new WebSocket("ws://"+SERVER_HOST+":"+SERVER_PORT);

    peerConnection = new RTCPeerConnection(peerConnectionConfig);

    peerConnection.onicecandidate = gotIceCandidate;
    // peerConnection.onTrack = gotRemoteTrack;
    peerConnection.onaddstream = gotRemoteStream; /**** Deprecated */
    // peerConnection.onnegotiationneeded = handleNegotiationNeeded;

    sendChannel = peerConnection.createDataChannel("sendChannel");
    sendChannel.onopen = handleSendChannelStatusChange;
    sendChannel.onclose = handleSendChannelStatusChange;

    serverConnection.onopen = async function(){ 
    
        const offer = await peerConnection.createOffer(offerOptions);

        await onCreateOfferSuccess(offer);
    
    };

    serverConnection.onmessage = processServerMessage;

}

async function onCreateOfferSuccess(desc) {
    //console.log(`Offer from pc1\n${desc.sdp}`);
    console.log('pc1 setLocalDescription start');
    try {
        await peerConnection.setLocalDescription(desc);
        onSetLocalSuccess(peerConnection);
    } catch (e) {
        console.log("Error: " + e);
    }
}

function gotIceCandidate(event) {
    console.log("got ice candidate");
    if(event.candidate != null) {
        serverConnection.send(JSON.stringify({'ice': event.candidate, 'uuid': uuid}));
    }
}

function onSetLocalSuccess(pc) {
    console.log("setLocalDescription complete");
    serverConnection.send(JSON.stringify({'sdp' : peerConnection.localDescription, 'uuid': uuid}));
}

function gotRemoteStream(event) {
    console.log('got remote stream!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log(event);
    player.srcObject = event.stream;
    player.play();
}

function gotRemoteTrack(event) {
  console.log('got remote track!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  player.srcObject = event.streams[0];
}

function handleNegotiationNeeded(event){

    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => serverConnection.send(JSON.stringify({ "sdp": peerConnection.localDescription, 'uuid': uuid })))
        .catch(errorHandler);

}


function processServerMessage(message){
 
    // if(!peerConnection) start(false);

    var signal = JSON.parse(message.data);

    // Ignore messages from ourself
    if(signal.uuid == uuid) return;

    if(signal.sdp) {
        peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function() {

            start_time = window.performance.now();
        // Only create answers in response to offers
        /*
            if(signal.sdp.type == 'offer') {
                peerConnection.createAnswer().then(createdDescription).catch(errorHandler);
            }
        */
        }).catch(errorHandler);
    }else if(signal.ice) {
        console.log("New message: new ICE candidate");
        console.log(signal.ice);
        peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(errorHandler);
    }

}

function errorHandler(error) {
  console.log(error);
}

// Taken from http://stackoverflow.com/a/105074/515584
// Strictly speaking, it's not a real UUID, but it gets the job done here
function createUUID() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function handleSendChannelStatusChange(event){
    if (sendChannel) {
        var state = sendChannel.readyState;
        if (state === "open") {
            console.log("Data channel is now open!");
        } else {
            console.log("Data channel is now closed!");
        }
    }
}

function sendMessage(message) {
    if(sendChannel.readyState==="open"){
        sendChannel.send(message);
        console.log("message sent: " + message);       
    }
}

function setPlayerHandlers(){

    player.addEventListener('pause', () => {
        console.log("Movie paused");
        sendMessage("pause");
    });

    player.addEventListener('play', () => {
        console.log("Movie resumed");
        sendMessage("resume");
    });

    /*
    player.addEventListener('onseeked', () => {
        console.log("Seeked to " + player.currentTime);
    });

    player.onseeking = function() {
        alert("Seek operation began!");
    };


    player.ontimeupdate = function(){
        //console.log(player.currentTime);
        console.log(player.srcObject.getVideoTracks());
    };
    */

    player.addEventListener("loadedmetadata", function() {

        console.log(">>>>>>>>>>> METADATA LOADED");
        
        /*
        track = document.createElement("track");
        track.kind = "captions";
        track.label = "English";
        track.srclang = "en";
        track.src = "http://localhost:1935/subtitles/1_eng.vtt";
        track.default = true;

        track.addEventListener("load", function() {
            console.log("LOAD");
            this.mode = "showing";
            player.textTracks[0].mode = "showing"; // thanks Firefox
        }, false);

        this.appendChild(track);
        track.mode = "showing";
        player.textTracks[0].mode = "showing";
        */
    }); 
    
}