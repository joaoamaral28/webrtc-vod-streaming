const jsdom = require("jsdom");
const { JSDOM } = jsdom;


const dom = new JSDOM(`<body> 

						<video id="player" src="1.mp4" autoplay> </video> 
 						
 					</body>`, { runScripts: "dangerously" });

console.log(dom.window.document.querySelector("video").play());