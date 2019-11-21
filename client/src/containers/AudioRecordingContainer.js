
// External Packages
import React, { Component } from 'react';
// import axios from 'axios';
import Button from 'react-bootstrap/Button';
import { ReactMic } from 'react-mic';
import recorder from 'node-record-lpcm16';
import fs from 'fs';
import RecorderJS from 'recorder-js';
// Internal Modules
// Styled Components
import AudioRecordingBox from '../styledComponents/AudioRecordingBox';
// import AudioRecordingButton from '../styledComponents/AudioRecordingButton';
// import GlobalTheme from '../styledComponents/GlobalTheme';


const constraints = {
    audio: true,
    video: false
};

const ButtonStyle = {
    width: '60px',
    height: '30px',
    margin: 'auto',
    display: 'table-cell',
    verticalAlign: 'middle',
    padding: 0,
}

const AudioOscillationStyle = {
    width: '200px',
    height: '80px',
    marginLeft: '10px',
}


/**
 * Get access to the users microphone through the browser.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#Using_the_new_API_in_older_browsers
 */
function getAudioStream() {
    // Older browsers might not implement mediaDevices at all, so we set an empty object first
    if (navigator.mediaDevices === undefined) {
      navigator.mediaDevices = {};
    }
  
    // Some browsers partially implement mediaDevices. We can't just assign an object
    // with getUserMedia as it would overwrite existing properties.
    // Here, we will just add the getUserMedia property if it's missing.
    if (navigator.mediaDevices.getUserMedia === undefined) {
      navigator.mediaDevices.getUserMedia = function(constraints) {
        // First get ahold of the legacy getUserMedia, if present
        var getUserMedia =
          navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
  
        // Some browsers just don't implement it - return a rejected promise with an error
        // to keep a consistent interface
        if (!getUserMedia) {
          return Promise.reject(
            new Error('getUserMedia is not implemented in this browser')
          );
        }
  
        // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
        return new Promise(function(resolve, reject) {
          getUserMedia.call(navigator, constraints, resolve, reject);
        });
      };
    }
  
    const params = { audio: true, video: false };
  
    return navigator.mediaDevices.getUserMedia(params);
  }
  
  /**
   * Snippets taken from:
   * https://aws.amazon.com/blogs/machine-learning/capturing-voice-input-in-a-browser/
   */
  
  const recordSampleRate = 44100;
  const exportSampleRate =  16000;
  /**
   * Samples the buffer at 16 kHz.
   */
  function downsampleBuffer(buffer, exportSampleRate) {
    if (exportSampleRate === recordSampleRate) {
      return buffer;
    }
  
    const sampleRateRatio = recordSampleRate / exportSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
  
    let offsetResult = 0;
    let offsetBuffer = 0;
  
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
  
      for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
  
      result[offsetResult] = accum / count;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
  
    return result;
  }
  
  function floatTo16BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }

  
  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
  
  /**
   * Encodes the buffer as a WAV file.
   */
  function encodeWAV(samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
  
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 32 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, recordSampleRate, true);
    view.setUint32(28, recordSampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    floatTo16BitPCM(view, 44, samples);
  
    return view;
  }

  function processAudio(samples) {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    floatTo16BitPCM(view,0,samples);
    return view;
  }
  

  /**
   * Samples the buffer at 16 kHz.
   * Encodes the buffer as a WAV file.
   * Returns the encoded audio as a Blob.
   */
  function exportBuffer(recBuffer) {
    const downsampledBuffer = downsampleBuffer(recBuffer, exportSampleRate);
    // const encodedWav = encodeWAV(downsampledBuffer);
    // const audioBlob = new Blob([encodedWav], {
    //   type: 'application/octet-stream'
    // });
    const audio = processAudio(downsampleBuffer);
    // return audioBlob;
    // console.log('Encoded wav', encodedWav);
    // console.log('WAV File')
    // return encodedWav;
    return audio;
  }
  

class AudioRecordingContainer extends Component {
    constructor(props) {
        super(props);
        this.state = {
            // record: false,
            // audio: null
            stream: null,
            recording: false,
            recorder: null,
            transcript: ''
        }
    }

    // Event handlers that will take care of triggering audio recording
    // and stopping it will be set up here 

    // Other event handler will also send the audio recording to an email for now
    // Will be modified later in order to store it to S3 or generally to 
    // send it to the AI Chatbot's API 

    async componentDidMount() {
        let stream;

        try {
            stream = await getAudioStream();
        } catch (error) {
            // If user browser doesn't support audio
            console.log('Error encountered', error);
            alert("Problem with the audio receiver: "+error.name);
        }

        this.setState({ stream });
    }

    // startRecording = () => {
    //     this.setState({
    //         record: true
    //     });
    //     // recorder.record().stream().pipe(tracks);
    // }

    // stopRecording = () => {
    //     this.setState({
    //         record: false
    //     });
    //     //recorder.record().stop();
    // }

    onData(recordedBlob) {
        console.log('chunk of real-time data is: ', recordedBlob);
    }
     
    onStop(recordedBlob) {
        console.log('recordedBlob is: ', recordedBlob);
        // console.log('File is', file);
    }
     
    getMicrophone = async () => {
        const audio = await navigator.mediaDevices.getUserMedia(constraints); 
        this.setState({ audio });
    }
     
    stopMicrophone = () => {
        this.state.audio.getTracks().forEach(track => track.stop());
        console.log('State of audio', this.state.audio);
        this.setState({ audio: null});
    }

    startRecord = () => {
        const { stream } = this.state;
        const audioContext = new (window.AudioContext ||window.webkitAudioContext)();
        const recorder = new RecorderJS(audioContext);
        recorder.init(stream);
        this.setState(
          {
            recorder,
            recording: true
          },
          () => {
            recorder.start();
          }
        );
    }

    stopRecord = async () => {
        const { recorder } = this.state;
        const { buffer } = await recorder.stop()
        const audio = exportBuffer(buffer[0]);
        console.log("Processed audio, sending audio to backend");
        // Do your audio processing here.
        console.log('AUDIO IS', audio);
        this.setState({
          recording: false
        });
        // const response = await fetch('http://localhost:5000/upload', {
        //   method: 'POST',
        //   headers: {
        //     'Accept': 'application/json',
        //     'Content-Type': 'application/json',
        //   },
        //   body: JSON.stringify({
        //     encoding: 'LINEAR16', 
        //     sampleRateHertz: exportSampleRate,
        //     languageCode: 'en-US',
        //     buffer : audio.buffer
        //   })
        // });
      const response = await fetch('http://localhost:5000/sayHi', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }, 
        body: {
          'Hi': 'Jack',
        }
      });
      const body = await response.json();
      this.setState({transcript: body.transcript});
      console.log("Received response from backend, should be displaying");
    }

    render() {
        //const { recording, stream } = this.state;

        return (
          <div>
            <AudioRecordingBox >
                <ReactMic
                record={this.state.record}
                style={AudioOscillationStyle}
                onStop={this.onStop}
                onData={this.onData}
                strokeColor="black"
                backgroundColor="white" 
                />
                <Button variant="outline-dark" style={ButtonStyle} onClick={this.startRecord}>;
                Record
                </Button>
                <Button variant="outline-dark" style={ButtonStyle} onClick={this.stopRecord}>;
                Stop recording
                </Button>
            </AudioRecordingBox>
            <h1>
              {this.state.transcript}
            </h1>
          </div>
        )
    }
}

export default AudioRecordingContainer;