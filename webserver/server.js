var express = require('express')
var unirest = require('unirest')
var mysql = require('mysql')
var cors = require('cors')
var validator = require('validator')
var bcrypt = require('bcryptjs')
var crypto = require('crypto')
var app = express()
var fs = require('fs');
var bodyParser = require('body-parser');
var io = require('socket.io').listen(3499)
var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use(cors())
var config = JSON.parse(fs.readFileSync('config/config.json')); // read config
console.log(config.riot_api)
var db = mysql.createConnection(config.mysql)

db.connect(function(err){
    if (err) console.log(err)
})

io.sockets.on('connection', function(socket){

})

//functions
function generate_key() {
    var sha = crypto.createHash('sha256');
    sha.update(Math.random().toString());
    return sha.digest('hex');
}

function authenticate(key, ip, callback){
	var user = {loggedIn: false, id: 0, email: ''}
  db.query('insert into requests (ip) VALUES (?)', [ip])
	db.query('select u.* from sessions s left outer join users u on s.user_id = u.id where s.session_hash = ?', [key])
	.on('result', function(data){
		user.loggedIn = true
		user.id = data.id
		user.email = data.email
	})
	.on('end', function(){
		console.log(user)
		callback(user)
	})
}

//endpoints

app.post('/auth/', upload.array(), function(req, res){
	var returnData = {authenticated: false}
	console.log(req.body)
	authenticate(req.body.key, req.connection.remoteAddress, function(user){
		if (user.loggedIn){
			returnData.authenticated = true
		}
		res.send(returnData)
	})
})

app.post('/register/', upload.array(), function(req, res){
	var returnData = {success: false}
  var found = false
  var valid = true

  if (!validator.isEmail(req.body.email)){
    valid = false
    returnData.reason = 'Invalid Email'
  }

  if (!validator.isLength(req.body.pass, {min: 6, max: 50})){
    valid = false
    returnData.reason = 'Password must be between 6 and 50 characters'
  }

  if (valid){
    db.query('select * from users where email = ? ', [req.body.email])
    .on('result', function(){
      found = true
    })
    .on('end', function(){
      //account doesn't already exist - go ahead and register
      if (!found){
        //hash pw
        bcrypt.genSalt(10, function(err, salt) {
            bcrypt.hash(req.body.pass, salt, function(err, hash) {
                //create user record
                db.query('insert into users (email, hash) VALUES (?, ?)', [req.body.email, hash], function(error, results, fields){
                  if (error){
                    returnData.reason = "Internal error occured"
                    res.send(returnData)
                  }
                  else{
                    var userid = results.insertId
                    var sessionkey = generate_key()
                    db.query('insert into sessions (user_id, session_hash) VALUES (?, ?)', [userid, sessionkey])
                    .on('end', function(){
                      returnData.sessionkey = sessionkey
                      returnData.success = true
                      res.send(returnData)
                    })
                  }
                })
            });
        });
      }
      else{
        returnData.reason = "Email already registered"
        res.send(returnData)
      }
    })
  }
  else{
    res.send(returnData)
  }
})

app.post('/newteam/', upload.array(), function(req, res){
  authenticate(req.body.key, req.connection.remoteAddress, function(user){
    var returnData = {success: false, authenticated: false}
    if (user.loggedIn){
      returnData.authenticated = true
      var summonernames = ''
      var summonerids = []
      console.log(req.body.summoners)
      if (req.body.summoners.length != 5){
        returnData.reason = 'Invalid number of summoners'
        res.send(returnData)
      }
      db.query('insert into teams (team_name, owner) VALUES (?, ?)', [req.body.name, user.id], function(error, results, fields){
        if (error){
          returnData.reason = "Internal error occured"
          res.send(returnData)
        }
        else{
          var teamid = results.insertId
          for (var i = 0; i < req.body.summoners.length; i++){
            console.log(req.body.summoners[i].summoner)
            summonernames += req.body.summoners[i].summoner+','
          }

          summonernames = summonernames.substring(0, summonernames.length-1)
          console.log(summonernames)
          unirest.get('https://na.api.pvp.net/api/lol/na/v1.4/summoner/by-name/'+summonernames+'?api_key='+config.riot_api)
          .headers({'Accept': 'application/json', 'Content-Type': 'application/json'})
          .end(function (response) {
            //console.log(response.body)
            var summonersData = response.body;
            console.log(summonersData)
            for (sum in summonersData){
              for (var i = 0; i < req.body.summoners.length; i++){
                if (summonersData[sum].name == req.body.summoners[i].summoner){
                  summonerids.push(summonersData[sum].id)
                  console.log(sum)
                  console.log('found and matched')
                  console.log(req.body.summoners[i])
                  db.query('insert into players (summoner_id, team_id, discord_display_name, discord_discriminator) VALUES (?, ?, ?, ?)', [summonersData[sum].id, teamid, req.body.summoners[i].name, req.body.summoners[i].number])
                }
              }
            }
            returnData.success = true
            res.send(returnData)
          });
        }
      })
    }
    else{
      res.send(returnData)
    }
  })
})

app.get('/teams/', function (req, res) {
	console.log(req.query)
	authenticate(req.query.key, req.connection.remoteAddress, function(user){
		var returnData = {authenticated: false, teams: []}
		if (user.loggedIn){
			returnData.authenticated = true
			var summonerids = ''
			var currTeam = 0
			var push = false
			var teams = []
			var team = {}
			team.players = []
			db.query('select p.*, t.team_name from teams t left outer join players p on t.id = p.team_id where t.owner = ? order by t.id', [user.id])
			.on('result', function(data){

				// check if the team is empty
				if (team.players.length == 0) {
					currTeam = data.team_id;
					team.id = data.team_id;
					team.name = data.team_name;
				}

				// add the player to the current team if they are on it
				if (data.team_id == currTeam) {
					team.players.push({sumid: data.summoner_id});
					summonerids += data.summoner_id + ', ';
				}
				else { // the current player is on a different team than the current one
					teams.push(team);
					team = {}
					team.players = []
					currTeam = data.team_id;

					team.id = data.team_id;
					team.name = data.team_name;

					team.players.push({sumid: data.summoner_id});
					summonerids += data.summoner_id + ', ';
				}
			})
			.on('end', function() {
				teams.push(team);
				console.log(teams);
				unirest.get('https://na.api.pvp.net/api/lol/na/v1.4/summoner/'+(summonerids.substring(0, summonerids.length-1))+'?api_key='+config.riot_api)
					.headers({'Accept': 'application/json', 'Content-Type': 'application/json'})
					.end(function (response) {
						var summonersData = response.body
						// for (var i = 0; i < summonersData.length; i++){
						// 	team.players[i].summoner_data = summonersData[i]
						// }
						for (var i = 0; i < teams.length; i++) {
							for (var j = 0; j < teams[i].players.length; j++) {

								var summonerId = teams[i].players[j].sumid;
								for (sum in summonersData) {
									if (summonersData[sum].id == summonerId) {
										teams[i].players[j].summoner_data = summonersData[sum];
									}
								}
							}
						}
						returnData.teams = teams;
						console.log(summonersData);
						res.send(returnData);
					});
			})
		}
		else{
			res.send(returnData)
		}

	})
})


app.listen(3500, function () {
	console.log('listening on port 3500')
})
