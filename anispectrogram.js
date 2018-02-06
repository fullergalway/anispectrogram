

function Anispectrogram(id,options){
  options = options || {};
  this.id=id;
  this.width = options.width ? parseInt(options.width) || 800 : 800
  this.height = options.height ? parseInt(options.height) || 400 : 400;
  this.data_url = options["hydrophone-url"] || "http://spiddal.marine.ie/data/hydrophones/SBF1622/";
  this.update_location_hash = options["update-location-hash"] === undefined? true: (options["update-location-hash"] === true || options["update-location-hash"] == "true");

  this.controls = options.controls === undefined? true:(options.controls===true || options.controls == "true");
  var default_stop = 30;
  var default_mqtt_start_delay = 0;

  this.mqtt_topic = options["mqtt-topic"] || 'spiddal-hydrophone';
  this.mqtt_enabled = options.mqtt === undefined? true:(options.mqtt===true || options.mqtt == "true");
  this.mqtt_url = options["mqtt-url"] ===undefined ? 'mqtt://mqtt.marine.ie': options["mqtt-url"] ;
  this.mqtt_start_delay = options["mqtt-start-delay"] === undefined ? default_mqtt_start_delay : isNaN(parseInt(options["mqtt-start-delay"]))?default_mqtt_start_delay:parseInt(options["mqtt-start-delay"]);
  this.mqttclient = null;
  this.live = false;

  this.rgb_cache = {};
  this.width_rows = this.width;
  this.drps = options.drps === undefined ? 50 : isNaN(parseInt(options.drps))?default_stop:parseInt(options.drps);;
  this.updated_time = 0;
  this.fft_seq_no = 0;
  this.data_rows = [];
  this.start_seq_no = -1;
  this.urls = [];
  this.foreground_color = options["foreground-color"] || "#FFFFFF";
  this.background_color = options["background-color"] || "#101214";

  this.max_buffer = this.dprs*60*2;//max 2 minutes of preloaded data.
  this.update_freq = 100;
  this.paused = false;
  this.idprefix = ""+this.id+"_";
  this.axisclass = ""+this.id+"_axis";
  this.was_paused = false;
  this.embed();
  var that = this;
  var autostop = options.autostop === undefined ? default_stop : isNaN(parseInt(options.autostop))?default_stop:parseInt(options.autostop);
  if(autostop > 0){
    setTimeout(function(){that.pause()},autostop*1000);
  }
  if( this.mqtt_start_delay >= 0){
    setTimeout(function(){that.startmqtt();},this.mqtt_start_delay*1000)
  }

};
  Anispectrogram.prototype.hideControls = function () {
    document.getElementById(this.idprefix+'_controls').style.display = 'none';
  };
  Anispectrogram.prototype.embed = function(){
    var that = this;
  // see http://bl.ocks.org/mbostock/3074470

  var css =
  '.'+this.axisclass+' text {font: 10px sans-serif; stroke: '+this.foreground_color+';  shape-rendering: crispEdges;}'
  +'.'+this.axisclass+' path, .'+this.axisclass+' line { fill: none; stroke: '+this.foreground_color+';  shape-rendering: crispEdges; }'
  +'.'+this.axisclass+' path { display: none; }'
  +'#'+this.idprefix+'play{ display: block; opacity: 0.8; transition: all 1.2s linear; width: 75px; height: 40px; background: white; position: absolute; border-radius: 5px; border: 1px solid black; z-index: 999; '
  + ' margin-top: '+Math.floor(this.height/2-20)+'px;'
  + ' margin-left: '+Math.floor(this.width/2-37.5)+'px; }'
  +'#'+this.idprefix+'play:hover { background-color:#00adef; }'
  +'#'+this.idprefix+'play:before { width: 0; height: 0; border-left: 30px solid black; border-right: 30px solid transparent; border-top: 15px solid transparent;'
  +' border-bottom: 15px solid transparent; position: absolute; content: ""; top: 5px; left: 30%;}';

  var style = document.createElement("style");
  style.innerHTML = css;
  document.head.appendChild(style);

    document.getElementById(this.id).innerHTML = '<div id="'+this.idprefix+'_controls">'
  +'<select id="'+this.idprefix+'year" name="'+this.idprefix+'year"></select>'
  +'<select id="'+this.idprefix+'month" name="'+this.idprefix+'month"></select>'
  +'<select id="'+this.idprefix+'day" name="'+this.idprefix+'day"></select>'
  +'<select id="'+this.idprefix+'time" name="'+this.idprefix+'time"></select>'
  +'<input type="button" id="'+this.idprefix+'go" name="'+this.idprefix+'go" value="&#10074;&#9668;">'
  +'<input type="button"name="'+this.idprefix+'pause_resume" id="'+this.idprefix+'pause_resume" value="&#10074;&#10074;">'
  +'slow<input type="range" id="'+this.idprefix+'speed" name="'+this.idprefix+'speed" value="10" min="1" max="100">fast'
  +'</p>'
  +'</div>'
  +'<div id="'+this.idprefix+'container"  style="width: '+this.width+'px; height: '+this.height+'px">'
  +'<svg style="position: absolute; display: inline" id="'+this.idprefix+'svg" width="'+this.width+'" height="'+(this.height+20)+'">'
  +'<rect height="100%" width="100%" fill="#101214"></rect>'
  +'<g id="'+this.idprefix+'xaxis"></g><g id='+this.idprefix+'"yaxis"></g>'
  +'</svg>'
  +'<canvas style="position: absolute; display: inline"  width='+this.width+' height='+this.height+' id="'+this.idprefix+'anispectrogram" style="width: '+this.width+'px; height: '+this.height+'px"></canvas>'
  +'<div id="'+this.idprefix+'play"></div>'
  +'</div>';
  if(!this.controls){
    this.hideControls();
  }
  document.getElementById(this.idprefix+'year').addEventListener("change",function(){that.set_month_options();});
  document.getElementById(this.idprefix+'month').addEventListener("change",function(){that.set_day_options();});
  document.getElementById(this.idprefix+'day').addEventListener("change",function(){that.set_time_options();});
  document.getElementById(this.idprefix+'go').addEventListener("click",function(){that.set_time_urls();});
  document.getElementById(this.idprefix+'pause_resume').addEventListener("click",function(){that.pause_resume();});
  document.getElementById(this.idprefix+'speed').addEventListener("change",function(){that.drps=this.value*this.value;});
  document.getElementById(this.idprefix+'container').addEventListener("click",function(){that.pause_resume();});
  var canvas = document.getElementById(this.idprefix+"anispectrogram");
  this.acontext = canvas.getContext("2d");
  this.imageData = this.acontext.createImageData(this.width,this.height);
  that.set_year_options(function(){that.set_time_urls();});
  that.fetch_hydrophone_data_next();
  setTimeout(function(){that.update_spectrogram();},0);

};
Anispectrogram.prototype.startmqtt = function(){
  var that = this;
  if(this.mqtt_enabled && typeof mqtt != 'undefined'){
    this.mqttclient = mqtt.connect(this.mqtt_url);
    this.mqttclient.on('connect', function () {
      if(!this.paused){
        that.mqttclient.subscribe(that.mqtt_topic);
      }
    });
    this.mqttclient.on("message", function(topic, payload) {
      if(that.was_paused || !that.live){
        console.log("switching to live mqtt feed");
        that.live = true;
        that.was_paused = false;
        that.drps = 4; // todo analyse payload
        that.hideControls(); // todo allow live to be turned off?
        that.updated_time = 0;
        that.fft_seq_no = 0;
        that.data_rows = [];
        that.start_seq_no = -1;
      }
      var text = ""+payload;
      // do it in the background
      setTimeout(function(){that.getFFTData({url: that.mqtt_url, hash: "live"},text);},0);
    });
  }
}
Anispectrogram.prototype.set_year_options = function(done){
    var that = this;
    this.extract(that.data_url,/^\d{4}\//, function(err,a){
      if(err){
        console.log("could not fetch year urls",err);
        return;
      }
       var pattern = /#(20[0-9][0-9]\/)[01][0-9]\/[0-3][0-9]\/[0-2][0-9]:[0-5][0-9]/;
       var options = that.a_to_options(that.data_url,a,pattern,a.length-1,function(t){return t;});
       document.getElementById(that.idprefix+"year").innerHTML = options;
       that.set_month_options(done);
    });
  };
Anispectrogram.prototype.set_time_options = function(done){
    var that = this;
    var e = document.getElementById(this.idprefix+"day");
    var durl = e.options[e.selectedIndex].value;
    this.extract(durl,/_\d{8}_\d{6}.txt/, function(err,a){
      if(err){
        console.log("could not fetch time urls",err);
        return;
      }
       var regex = /.*_(\d\d)(\d\d)[^_]*$/;
       var pattern = /#20[0-9][0-9]\/[01][0-9]\/[0-3][0-9]\/([0-2][0-9]:[0-5][0-9])/;
       var options = that.a_to_options(durl,a,pattern,0,function(t){
            return t.replace(regex,"$1:$2");
          });
       document.getElementById(that.idprefix+"time").innerHTML = options;
       setTimeout(function(){(done||function(){})();},0);
    });
};
Anispectrogram.prototype.set_day_options = function(done){
    var that = this;
    var e = document.getElementById(this.idprefix+"month");
    var murl = e.options[e.selectedIndex].value;
    this.extract(murl,/^\d{2}\//, function(err,a){
      if(err){
        console.log("could not fetch day urls",err);
        return;
      }
       var pattern = /#20[0-9][0-9]\/[01][0-9]\/([0-3][0-9]\/)[0-2][0-9]:[0-5][0-9]/;
       var options = that.a_to_options(murl,a,pattern,a.length-1, function(t){return t;});
       document.getElementById(that.idprefix+"day").innerHTML = options;
       that.set_time_options(done);
    });
};
Anispectrogram.prototype.set_month_options = function(done){
    var that = this;
    var e = document.getElementById(this.idprefix+"year");
    var yurl = e.options[e.selectedIndex].value;
    this.extract(yurl,/^\d{2}\//, function(err,a){
      if(err){
        console.log("could not fetch month urls",err);
        return;
      }
       var pattern = /#20[0-9][0-9]\/([01][0-9]\/)[0-3][0-9]\/[0-2][0-9]:[0-5][0-9]/;
       var options = that.a_to_options(yurl,a,pattern,a.length-1, function(t){return t;});
       document.getElementById(that.idprefix+"month").innerHTML = options;
       that.set_day_options(done);
    });
};

Anispectrogram.prototype.resume = function(){
    this.paused = false;
    document.getElementById(this.idprefix+'pause_resume').value = String.fromCharCode(10074,10074);
    document.getElementById(this.idprefix+'play').style.opacity = 0;
    if(this.live){
      this.was_paused = true;
      this.start_seq_no = this.start_seq_no - this.drps * 60;
      this.mqttclient.subscribe(this.mqtt_topic);
    }
};
Anispectrogram.prototype.pause = function(){
    this.paused = true;
    document.getElementById(this.idprefix+'pause_resume').value = String.fromCharCode(9658);
    document.getElementById(this.idprefix+'play').style.opacity = 0.8;
    if(this.live){
      this.mqttclient.unsubscribe(this.mqtt_topic);
    }
};
Anispectrogram.prototype.pause_resume = function(){
    this.paused?this.resume():this.pause();
};

Anispectrogram.prototype.update_spectrogram = function(){
  var that = this;
    try{
      if(!this.paused){
        this.spectrogram();
      }
    }finally{
        setTimeout(function(){that.update_spectrogram();},this.update_freq);
    }
};
Anispectrogram.prototype.fetch_hydrophone_data_next = function(){
    var that = this;
    if(this.live || this.paused || this.data_rows.length >= this.max_buffer){
        setTimeout(function(){that.fetch_hydrophone_data_next();},1000);
        return;
    }
    var fetch_obj = this.urls.shift();
    if(fetch_obj){
        this.fetch_hydrophone_data(fetch_obj);
    }else{
        setTimeout(function(){that.fetch_hydrophone_data_next();},1000);
    }
};
 Anispectrogram.prototype.fetch_hydrophone_data = function(fetch_obj){
   var that = this;
  fetch(fetch_obj.url,{cache: "force-cache"})
    .then(this.checkStatus)
    .then(function(response) {
      return response.text();
  }).then(function(t) {
    if(!that.live){ //todo allow switch from live to archive
      that.getFFTData(fetch_obj,t);
      setTimeout(function(){that.fetch_hydrophone_data_next();},500);
   }
  }).catch(function(error) {
    console.log('request failed', error);
    that.fetch_hydrophone_data_next();
  })
};
Anispectrogram.prototype.a_to_options = function(base_url,a,hash_pattern,default_selected_index,transform){
  var that = this;
   var options = [];
   var selected = default_selected_index;
   if(document.location.hash.match(hash_pattern)){
     var wanted = document.location.hash.match(hash_pattern)[1];
     for(var i=0;i<a.length;i++){
       var text = transform(a[i]);
       if(text == wanted){
         selected = i;
         break;
       }
       if(text > wanted){
         selected = i>0?i-1:0;
         break;
       }
     }
   }
   for(var i=0;i<a.length;i++){
      options.push("<option value='"+base_url+a[i]+"' ");
      var text = transform(a[i]);
      if(i == selected){
         options.push("selected='selected'");
      }
      options.push(">"+text+"</option>");
   }
   return options.join("");
};
Anispectrogram.prototype.getSelectedText = function(elementId){
   var e = document.getElementById(elementId);
  if (e.selectedIndex == -1) return null;
  return e.options[e.selectedIndex].text;
};
Anispectrogram.prototype.getSelectedValue = function(elementId){
   var e = document.getElementById(elementId);
  if (e.selectedIndex == -1) return null;
  return e.options[e.selectedIndex].value;
};
 Anispectrogram.prototype.set_time_urls = function(){
  this.pause();
  this.data_rows = [];
  this.start_seq_no = -1;
  var e = document.getElementById(this.idprefix+"time");
  if (e.selectedIndex == -1) return;
  var hash_day = '#'+this.getSelectedText(this.idprefix+'year')
             + this.getSelectedText(this.idprefix+'month')
             + this.getSelectedText(this.idprefix+'day');
  if(this.update_location_hash){
    document.location.hash = hash_day + this.getSelectedText(this.idprefix+'time');
  }
  var time = e.options[e.selectedIndex].text;
  var nurls = [];
  for(var i=e.selectedIndex; i<e.options.length;i++){
      nurls.push({hash: hash_day+e.options[i].text, url:e.options[i].value});
  }
  this.urls = nurls;
  if(this.mqtt_enabled){ // just the latest data
    var url = this.urls.pop();
    if(url !== undefined){
      this.urls = [url];
    }
  }
  this.resume();
};
Anispectrogram.prototype.spectrogram = function(){
  if(this.data_rows.length == 0) return;
  while(this.data_rows.length < this.width_rows){
    //backfill until some data loads
    var copy = JSON.parse(JSON.stringify(this.data_rows[0]));
    copy.seq_no = copy.seq_no -1;
    copy.data[1] = "";//timestamp
    this.data_rows.unshift(copy);
  }
  var that = this;
  var now = new Date().getTime();
  var dy = this.data_rows[0].data.length-2;
  var dx = this.width_rows;
  var first_seq_no = this.data_rows[0].seq_no;
  var offset = this.start_seq_no - first_seq_no;
  if(offset >= this.data_rows.length){
     return;
  }
  var shift_lines = Math.min(Math.floor((now - this.updated_time)*this.drps/1000),Math.ceil(dx/5));
  if(shift_lines == 0){
    return;
  }
  if(offset < 0 || this.start_seq_no < first_seq_no){
     offset = 0;
     this.start_seq_no = first_seq_no;
  }else{
     this.start_seq_no = this.start_seq_no+shift_lines;
  }
  var limit = offset + shift_lines + shift_lines;


  if(limit >= this.data_rows.length){
      return;
  }

  var x = d3.scale.linear()
      .domain([0, dx])
      .range([0, this.width]);

  var y = d3.scale.linear()
      .domain([0, dy])
      .range([this.height, 0]);

  var color = d3.scale.linear()
      .domain([10,20,30,40,50])
      .range(["#0000ff","#33cc33","#ffff00","#ff9933", "#cc3300"]);

  var yAxis = d3.svg.axis()
        .ticks(20)
        .scale(y)
      .orient("left")
      .tickFormat(function(d, i){
            var hz = parseInt(this.data_rows[0].headers[d]);
            return isNaN(hz)?"":hz>1000?(""+(hz/1000)+"kHz"):(""+hz+" Hz");
            return ""+that.data_rows[0].headers[d]+" Hz";
    });

  var xAxis = d3.svg.axis()
      .scale(x)
      .orient("bottom")
      .tickFormat(function(d, i){
           var k = limit - dx + d;
           return k >= 0?that.data_rows[k].data[1]:"";
       });

  var hk = Math.max(limit-dx,0);
  if(this.update_location_hash){
      document.location.hash = this.data_rows[hk].hash;
  }


  var svg = d3.select("#"+this.idprefix+"svg")
      .attr("width", this.width)
      .attr("height", this.height+20);
    d3.select("#"+this.idprefix+"xaxis")
      .attr("class", "x "+this.axisclass)
      .attr("transform", "translate(0," + this.height + ")")
      .call(xAxis)
      .call(that.removeZero);
    d3.select("#"+this.idprefix+"yaxis")
      .attr("class", "y "+this.axisclass)
      .call(yAxis)
      .call(that.removeZero);

  this.drawImage(this.acontext,shift_lines,dx,dy,limit,color);
  this.updated_time = now;
  for(var i=0; i<offset && this.data_rows.length>this.max_buffer;i++){
     this.data_rows.shift();
  }

};
Anispectrogram.prototype.removeZero = function(axis){
  axis.select('#'+this.idprefix+'xaxis').filter(function(d) { return !d; }).remove();
  axis.select('#'+this.idprefix+'yaxis').filter(function(d) { return !d; }).remove();
};
Anispectrogram.prototype.drawImage =function(context,shiftx,dx,dy,limit,color) {
  var image = null, orig = null;
  var orig = null;
  if(shiftx<dx){
      orig = context.getImageData(shiftx,0,dx-shiftx,dy);
  }
  var image = context.getImageData(dx-shiftx,0,shiftx,dy);
  var c = null;
  var xstart = shiftx > 0?limit-shiftx:offset;
  for (var y = dy-1, p = -1; y > 0 ; y--) {
    for (var x = xstart; x < limit; x++) {
        var k = this.data_rows[x].data[y+2];
        if(k in this.rgb_cache){
            c = this.rgb_cache[k];
        }else{
            c = d3.rgb(color(k));
            this.rgb_cache[k] = c;
        }
      image.data[++p] = c.r;
      image.data[++p] = c.g;
      image.data[++p] = c.b;
      image.data[++p] = 255;
    }
  }
  if(orig != null){
    context.putImageData(orig, 0, 0);
  }
  context.putImageData(image, dx-shiftx, 0);

};
Anispectrogram.prototype.getFFTData = function(fetch_obj,t){
    var text = t.split('\n'), l = "";
    var start_date = "";
    while(text.length > 0 ){
        l = text.shift();
        if(l.match("^Start Date")){
            start_date = l.split(/\s+/)[2];
        }
        if( l.match("^Data:.*$")){
            break;
        }
    }
    var headers = null;
    for(var i=0;i<text.length;i++){
        var a = text[i].split(/\t/);
        if(i>0 && a.length < headers.length){
            break;
        }
        var time = a[0];
        a = a.slice(6);
        for(var j=0; j<a.length;j++){
            a[j] = parseInt(a[j]);
        }
        a.unshift(time);
        a.unshift(start_date);
        if(i == 0){
          headers = a;
        }else{
          this.data_rows.push({ seq_no: this.fft_seq_no++, row: i, headers: headers, data: a, url: fetch_obj.url, hash: fetch_obj.hash});
        }
    }
};
Anispectrogram.prototype.checkStatus = function (response) {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    var error = new Error(response.statusText)
    error.response = response
    throw error
  }
};
Anispectrogram.prototype.extract = function(url,pattern,cb){
     var that = this;
     fetch(url)
      .then(this.checkStatus)
      .then(function(response){
        return response.text();
      }).then(function(text){
        var d = document.createElement("div");
        d.innerHTML = text;
        wanted = [];
        var a = d.querySelectorAll('a');
        for(var i=0;i<a.length;i++){
          var href = a[i].getAttribute("href");
          if(href.match(pattern)){
            wanted.push(href);
          }
        }
        setTimeout(function(){cb(null,wanted);},0);
      }).catch(function(err) {
        setTimeout(function(){cb(err,null);},0);
      });
  };

var loadAnispectrograms = function(){
var els = document.getElementsByClassName("anispectrogram");
Array.prototype.forEach.call(els, function(el) {
    if(!el.id){
      el.id = "as"+Math.floor(Math.random() * 10000000);
    }
    var options = {};
    for (var i = 0; i < el.attributes.length; i++) {
         var key =el.attributes[i].name;
         if(key.startsWith("data-")){
           key = key.substring(5);
           options[key] = el.attributes[i].value;
         }
    }
    new Anispectrogram(el.id,options);
});
};
var myLoadScript = function(src,cb){
  console.log("anispectrogram loading script "+src);
 var script = document.createElement('script');
 script.type = 'text/javascript';
 script.async = true;
 script.onload = function(){
     cb();
 };
 script.src = src;
 document.getElementsByTagName('head')[0].appendChild(script);
};
var asBeginAction = loadAnispectrograms;
if (typeof fetch != 'function') {
  var asBeginActionA = asBeginAction;
  asBeginAction = function(){myLoadScript("https://cdnjs.cloudflare.com/ajax/libs/fetch/0.10.1/fetch.min.js",asBeginActionA);};
}
if (typeof d3 == 'undefined') {
  var asBeginActionB = asBeginAction;
  asBeginAction = function(){myLoadScript("https://d3js.org/d3.v3.min.js",asBeginActionB);};
}
if(typeof mqtt == 'undefined'){
  var asBeginActionC = asBeginAction;
  asBeginAction = function(){myLoadScript("http://mqtt.marine.ie/mqtt.js",asBeginActionC);};
}
asBeginAction();
