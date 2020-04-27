# WebRTC VOD streaming

WebRTC stream implementation for a Video On Demand (VOD) service. Developed for the practical project course 2578 - Services Engineering.

 WebRTC is an open framework for the web that enables Real-Time Communications (RTC) capabilities in the browser. This allows the execution
 of new applications such as phone calls, video chat and P2P sharing without any required additional plugins. 

For this project, the implementation of WebRTC eased the complexities of programming a dedicated streaming service since it handles all the
session setup and configuration properties such as video quality and resolution, codecs, transmission protocols and so on. 

However, WebRTC requires a MediaStream object input in order to properly broadcast the video stream. This way, at the time of development,
the only way to generate such object was through the loading of the video in a video html element and through its posterior capture using 
the captureStream() method, resulting in the WebRTC streamable MediaStream object. Therefore it is easy to see why this streaming 
solution falls far from ideal and is not scalable or reliable. Using PhantomJS or running headless browsers to perform the capture could
potentially enchance the performance, however I could not manage to make these experiments functional at the time of development.
