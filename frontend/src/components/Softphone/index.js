import React from 'react'
import ReactSoftphone from 'react-softphone'
import { WebSocketInterface } from 'jssip';


  const SIP_DOMAIN = process.env.REACT_APP_SIP_DOMAIN || 'sip.seudominio.com';
  const SIP_USER = process.env.REACT_APP_SIP_USER || '';
  const SIP_WS_URL = process.env.REACT_APP_SIP_WS_URL || `wss://${SIP_DOMAIN}:8089/ws`;

  const config = {
    domain: SIP_DOMAIN,
    uri: `sip:${SIP_USER}@${SIP_DOMAIN}`,
    password: process.env.REACT_APP_SIP_PASSWORD || '',
    ws_servers: SIP_WS_URL,
    sockets: new WebSocketInterface(SIP_WS_URL),
    display_name: SIP_USER,
    websocket_url: SIP_WS_URL,
    sip_outbound_ur: `udp://${SIP_DOMAIN}:5060`,
    debug: false
  };
const setConnectOnStartToLocalStorage =(newValue)=>{
// Handle save the auto connect value to local storage
return true
}
const setNotifications =(newValue)=>{
// Handle save the Show notifications of an incoming call to local storage
return true
}
const setCallVolume =(newValue)=>{
// Handle save the call Volume value to local storage
return true
}
const setRingVolume =(newValue)=>{
// Handle save the Ring Volume value to local storage
return true
}

console.log(setConnectOnStartToLocalStorage)

function SoftPhone() {
  return (
    <div className="SoftPhone">
      <header className="SoftPhone-header">
         <ReactSoftphone
                     callVolume={33} //Set Default callVolume
                     ringVolume={44} //Set Default ringVolume
                     connectOnStart={false} //Auto connect to sip
                     notifications={false} //Show Browser Notification of an incoming call
                     config={config} //Voip config
                     setConnectOnStartToLocalStorage={setConnectOnStartToLocalStorage} // Callback function
                     setNotifications={setNotifications} // Callback function
                     setCallVolume={setCallVolume} // Callback function
                     setRingVolume={setRingVolume} // Callback function
                     timelocale={'UTC+3'} //Set time local for call history
                   />
      </header>
    </div>
  );
}

export default SoftPhone;