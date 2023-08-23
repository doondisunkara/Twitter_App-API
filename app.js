const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { format, isValid } = require("date-fns");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running ...");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = async (request, response, next) => {
  const { tweetId } = request.params;
  const { tweet } = request.body;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
    if (jwtToken !== undefined) {
      jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          request.userId = payload.user_id;
          request.tweetId = tweetId;
          request.tweet = tweet;
          console.log(payload);
          next();
        }
      });
    } else {
      response.status(401);
      response.send("Invalid JWT Token");
    }
  } else {
    response.status(401);
    response.send("Invalid Authorization Header");
  }
};

const userTweetRequest = async (request, response, next) => {
  const { userId, tweetId } = request;
  const followingTweetsQuery = `
    SELECT * FROM follower 
    INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE follower_user_id = ${userId} and tweet_id = ${tweetId};`;
  const followingUserTweet = await db.all(followingTweetsQuery);
  if (followingUserTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//API 1 - ADD USER API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUser = `SELECT * FROM user WHERE username LIKE '${username}';`;
  const user = await db.get(getUser);
  if (user === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPwd = await bcrypt.hash(password, 10);
      const createUser = `
      INSERT INTO user (name, username, password, gender)
      VALUES(
          '${name}',
          '${username}',
          '${hashedPwd}',
          '${gender}'
      );`;
      await db.run(createUser);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2 - LOGIN API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUser = `SELECT * FROM user WHERE username LIKE '${username}';`;
  const user = await db.get(getUser);
  if (user !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, user.password);
    if (isPasswordMatched) {
      const payload = { username: username, user_id: user.user_id };
      console.log(payload);
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API 3 - LATEST TWEETS
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  console.log(userId);
  const getTweetsQuery = `
  SELECT 
  username, 
  tweet,
  date_time AS dateTime
  FROM (follower
    INNER JOIN tweet ON following_user_id = tweet.user_id) AS T
    INNER JOIN user ON T.user_id = user.user_id 
    WHERE T.follower_user_id = ${userId}
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;
  const tweetDetails = await db.all(getTweetsQuery);
  response.send(tweets);
});

//API 4 - USER FOLLOWS
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getFollowsQuery = `
    SELECT
    name 
    FROM
    follower
    INNER JOIN user ON follower.following_user_id = user.user_id
    WHERE follower_user_id = ${userId};`;
  const followUsers = await db.all(getFollowsQuery);
  response.send(followUsers);
});

//API 5 - PEOPLE FOLLOWS USER
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  console.log(userId);
  const userFollowersQuery = `
    SELECT
    name , user.user_id
    FROM
    follower
    INNER JOIN user ON follower.follower_user_id = user.user_id
    WHERE following_user_id = ${userId};`;
  const userFollowers = await db.all(userFollowersQuery);
  response.send(userFollowers);
});

//API 6 - TWEETS OF FOLLOWING USERS
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  userTweetRequest,
  async (request, response) => {
    const { tweetId } = request;
    console.log(new Date());
  }
);

//API 8 -

//API 10 - CREATE TWEET
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId, tweet } = request;
  const createTweetQuery = `
    INSERT 
    INTO
    tweet 
    (tweet, user_id, date_time)
    VALUES
    (
        '${tweet}',
        ${userId},
        '${format(new Date(), "yyyy-MM-dd HH:mm:ss")}'
        );`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11 - DELETE TWEET
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { userId, tweetId } = request;
    const getTweet = `
    SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweetDetails = await db.get(getTweet);
    console.log(tweetDetails);
    if (tweetDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      if (userId !== tweetDetails.user_id) {
        response.status(401);
        response.send("Invalid Request");
      } else {
        const deleteTweet = `
        DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
        await db.run(deleteTweet);
        response.send("Tweet Removed");
      }
    }
  }
);

module.exports = app;
