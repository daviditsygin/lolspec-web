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

			var team = {}
			team.players = []
			db.query('select p.*, t.team_name from teams t left outer join players p on t.id = p.team_id where t.owner = ? order by t.id', [user.id])
			.on('result', function(data){

				if (data.team_id != currTeam){

					if (currTeam > 0){
						summonerids = summonerids.substring(0, summonerids.length-1)
						console.log(summonerids)
						unirest.get('https://na.api.pvp.net/api/lol/na/v1.4/summoner/'+summonerids+'?api_key='+config.riot_api)
						.headers({'Accept': 'application/json', 'Content-Type': 'application/json'})
						.end(function (response) {
							var summonersData = response.body
							for (var i = 0; i < summonersData.length; i++){
								team.players[i].summoner_data = summonersData[i]
							}
							returnData.teams.push(team)
							currTeam = data.team_id
							team = {}
							team.players = []
						});
					}
				}
				team.id = data.team_id
				team.name = data.team_name
				team.players.push({dbname: data.name, sumid: data.summoner_id})
				summonerids += data.summoner_id+','
			})
			.on('end', function(){

				summonerids = summonerids.substring(0, summonerids.length-1)
				console.log(summonerids)
				unirest.get('https://na.api.pvp.net/api/lol/na/v1.4/summoner/'+summonerids+'?api_key='+config.riot_api)
				.headers({'Accept': 'application/json', 'Content-Type': 'application/json'})
				.end(function (response) {
					//console.log(response.body)
					var summonersData = response.body;
					for (sum in summonersData){
						for (var i = 0; i < team.players.length; i++){
							if (team.players[i].sumid == summonersData[sum].id){
								team.players[i].summoner_data = summonersData[sum]
							}
						}

					}
					returnData.teams.push(team)
					res.send(returnData)

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
