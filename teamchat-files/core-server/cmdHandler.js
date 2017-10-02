var spawn = require('child_process').spawn;
var child; //= spawn('java', ['-jar', 'LeagueReplayComplete.jar']);
var proctab = [];
var once = true;
//console.log('stdout: ' + stdout);awdawd
//console.log('stderr: ' + stderr);

exports.startDiscordBot = function(done) {
	child = spawn('java', ['-jar', './LeagueReplayComplete.jar']);
	proctab = ["start"]; //= ["start"];

	child.stderr.on('data', (data) => {
		//console.log(`stdout: ${data}`);
	})

	child.stdout.on('data', (data) => {
		//console.log(`stdout: ${data}`);
	  //when stdout gets an "ended current process" message, execute first in queue
	  if(`${data}`.match("Ended current process")) {
		if (once) {
			once = false;
			done();
		}

	    if (!proctab[0]){
	      return;
	    }
	    //only happens when the bot boots up
	    if(proctab[0] == "start"){
		  console.log("discord bot initiated");
	      proctab.shift();
		  //console.log(proctab);
		  if (!proctab[0]) {
			  return;
		  }
	    }
	    child.stdin.write(proctab[0],"utf-8",proctab.shift());
	  }
	});

	child.stderr.on('data', (data) => {
	 // console.log(`stderr: ${data}`);
	});

	child.on('close', (code) => {
	 // 0+2 console.log(`child process exited with code ${code}`);
	});
}

exports.stopBot = function() {
	// TODO
}

//pushes the command to the queue
exports.signal = function(str) {
	str+="\n";
  if(!proctab[0]){
    proctab.push(str);
    child.stdin.write(proctab[0],"utf-8",proctab.shift());
  }
  else{
    proctab.push(str);
  }
}
//
// //Note: will not work if joining and saving the same guild less than 3 secs apart
//   signal("!joinid 279394304894435329\n");
//   setTimeout(function(){
//   signal("!saveid 279394304894435329\n");
// },7000);
//
//   signal("!joinid 196297375046696960\n");
// //child.stdin.end();
