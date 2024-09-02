const mysql = require("mysql");
const app = express();
const port = process.env.PORT || 5000;

// Middleware to parse JSON
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
  host: "your-hostgator-mysql-host",
  user: "your-mysql-username",
  password: "your-mysql-password",
  database: "your-database-name",
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    process.exit(1); // Exit the application if connection fails
  }
  console.log("Connected to MySQL");
});

// Ensure queries are executed only if the connection is established
const executeQuery = (query, params, callback) => {
  if (db.state === "authenticated") {
    db.query(query, params, callback);
  } else {
    console.error("MySQL connection is not authenticated");
    callback(new Error("MySQL connection error"));
  }
};

// API route to create a new user
app.post("/api/create-account", (req, res) => {
  const { email, password } = req.body;
  const query = "INSERT INTO users (email, password) VALUES (?, ?)";
  executeQuery(query, [email, password], (err, result) => {
    if (err) {
      console.error("Error inserting user:", err);
      res.status(500).json({ error: "Database error" });
      return;
    }
    res.status(201).json({ message: "Account created successfully" });
  });
});

// API route to authenticate a user
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const query = "SELECT * FROM users WHERE email = ? AND password = ?";
  executeQuery(query, [email, password], (err, results) => {
    if (err) {
      console.error("Error querying user:", err);
      res.status(500).json({ error: "Database error" });
      return;
    }
    if (results.length > 0) {
      res.status(200).json({ message: "Login successful" });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
