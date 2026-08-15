/* =====================================================================
   LiveRelay — the one place in this suite that talks to the outside world.

   Everything else here runs entirely on your device. A live scoreboard
   can't: a parent at home and a scorer at the ground are two devices that
   need something in the middle. This uses a free public MQTT broker over
   WebSocket, which means no account, no server to run and no cost.

   Be clear about what that is: a PUBLIC BROADCAST. Anyone holding the
   link can watch, and in principle publish to the same topic. That is an
   acceptable trade for team names and scores; it must never be used for
   anything about a child that isn't already being shouted across a field.

   Messages are published RETAINED, so a parent who opens the link ten
   minutes into the meet immediately gets the current state instead of a
   blank screen until the next update.

   A minimal MQTT 3.1.1 client is implemented here rather than pulling in
   a ~100KB library, because the viewer file handed to parents has to be
   self-contained and open instantly on a cheap phone.
   ===================================================================== */
(function(){
"use strict";

const DEFAULT_URL="wss://broker.hivemq.com:8884/mqtt";

function lrConnect(opts){
  const url=opts.url||"wss://broker.hivemq.com:8884/mqtt";
  const topic=opts.topic;
  const onMessage=opts.onMessage||function(){};
  const onStatus=opts.onStatus||function(){};
  const wantSub=opts.subscribe!==false;

  let ws=null,alive=false,ping=null,closed=false,retry=0;

  // --- MQTT wire helpers ---------------------------------------------
  function enc(str){
    const b=[];for(let i=0;i<str.length;i++){
      const c=str.charCodeAt(i);
      if(c<0x80)b.push(c);
      else if(c<0x800){b.push(0xC0|c>>6,0x80|c&63);}
      else{b.push(0xE0|c>>12,0x80|(c>>6)&63,0x80|c&63);}
    }
    return b;
  }
  function str(s){const b=enc(s);return [b.length>>8,b.length&255].concat(b);}
  function len(n){const o=[];do{let d=n%128;n=Math.floor(n/128);if(n>0)d|=128;o.push(d);}while(n>0);return o;}
  function pkt(type,body){return new Uint8Array([type].concat(len(body.length),body));}
  function dec(bytes){
    let s="";
    for(let i=0;i<bytes.length;i++){
      const c=bytes[i];
      if(c<0x80)s+=String.fromCharCode(c);
      else if(c>=0xC0&&c<0xE0){s+=String.fromCharCode(((c&31)<<6)|(bytes[++i]&63));}
      else if(c>=0xE0){s+=String.fromCharCode(((c&15)<<12)|((bytes[++i]&63)<<6)|(bytes[++i]&63));}
    }
    return s;
  }

  function open(){
    if(closed)return;
    onStatus(retry?"reconnecting":"connecting");
    try{ws=new WebSocket(url,"mqtt");}catch(e){onStatus("error");schedule();return;}
    ws.binaryType="arraybuffer";

    ws.onopen=function(){
      const id="s"+Math.random().toString(36).slice(2,10);
      // CONNECT: protocol MQTT level 4, clean session, 60s keepalive
      const body=str("MQTT").concat([4,0x02,0,60],str(id));
      ws.send(pkt(0x10,body));
    };
    ws.onmessage=function(ev){
      const d=new Uint8Array(ev.data);
      let i=0;
      while(i<d.length){
        const type=d[i]>>4,flags=d[i]&15;i++;
        let mult=1,rl=0,b;
        do{b=d[i++];rl+=(b&127)*mult;mult*=128;}while(b&128);
        const end=i+rl;
        if(type===2){ // CONNACK
          alive=true;retry=0;onStatus("connected");
          if(wantSub){
            const body=[0,1].concat(str(topic),[0]);
            ws.send(pkt(0x82,body));
          }
          clearInterval(ping);
          ping=setInterval(function(){if(ws&&ws.readyState===1)ws.send(new Uint8Array([0xC0,0]));},50000);
        }else if(type===3){ // PUBLISH
          const tl=(d[i]<<8)|d[i+1];
          const t=dec(d.subarray(i+2,i+2+tl));
          let p=i+2+tl;
          if(((flags>>1)&3)>0)p+=2;           // skip packet id when QoS > 0
          const payload=dec(d.subarray(p,end));
          try{onMessage(JSON.parse(payload),t);}catch(e){onMessage(payload,t);}
        }
        i=end;
      }
    };
    ws.onclose=function(){alive=false;clearInterval(ping);if(!closed){onStatus("offline");schedule();}};
    ws.onerror=function(){/* onclose always follows, so recovery is handled there */};
  }
  function schedule(){
    if(closed)return;
    retry++;
    // back off, but never so far that a scorer thinks it has died for good
    setTimeout(open,Math.min(15000,1000*Math.pow(1.6,Math.min(retry,6))));
  }
  open();

  return{
    publish:function(obj){
      if(!ws||ws.readyState!==1||!alive)return false;
      const payload=enc(JSON.stringify(obj));
      // retain=1 so whoever opens the link next sees the current state at once
      const body=str(topic).concat(payload);
      ws.send(pkt(0x31,body));
      return true;
    },
    isLive:function(){return alive;},
    // Bytes handed to the socket that haven't gone out yet. A socket can stay
    // "open" long after the network has actually gone — on a phone walking out
    // of wifi range, TCP can take minutes to notice. If this stays above zero,
    // we are talking to nobody, and the scorer needs to be told that.
    pending:function(){return ws?ws.bufferedAmount:0;},
    close:function(){closed=true;clearInterval(ping);if(ws)try{ws.close();}catch(e){}}
  };
}

// Inlined verbatim into the viewer file handed to parents, so the console and the
// viewer can never disagree about the wire format.
const SOURCE=lrConnect.toString();

window.LiveRelay={
  connect:lrConnect,
  SOURCE:SOURCE,
  DEFAULT_URL:DEFAULT_URL,
  newTopic:function(prefix){
    return (prefix||"tesa/sports")+"/"+Math.random().toString(36).slice(2,8)+Math.random().toString(36).slice(2,6);
  }
};
})();
