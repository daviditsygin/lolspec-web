var express = require('express')
var unirest = require('unirest')
var mysql = require('mysql')
var cors = require('cors')
var app = express()
var fs = require('fs');
var bodyParser = require('body-parser');
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

//functions
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
