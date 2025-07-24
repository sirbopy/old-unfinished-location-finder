// Firebase debug and initialization helper

function checkFirebaseConnection() {
    console.log("Checking Firebase connection...");
    
    // Firebase configuration
    const firebaseConfig = {
        
    };
    
    // Display status in a debug element
    const debugElement = document.getElementById('firebase-debug');
    if (debugElement) {
        debugElement.innerHTML += '<div>Attempting to connect to Firebase...</div>';
    }
    
    try {
        // Initialize Firebase with explicit error handling
        const app = firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();
        const db = firebase.firestore();
        
        // Test auth state
        auth.onAuthStateChanged(function(user) {
            if (user) {
                console.log("Auth state: Signed in as", user.email);
                if (debugElement) {
                    debugElement.innerHTML += `<div style="color:green">✓ Firebase auth connected. User: ${user.email}</div>`;
                }
                // Make sure user status banner is displayed
                updateUserStatus(user, userIP);
            } else {
                console.log("Auth state: Not signed in");
                if (debugElement) {
                    debugElement.innerHTML += '<div>Firebase auth connected. No user signed in.</div>';
                }
                // Still update status banner
                updateUserStatus(null, userIP);
            }
        });
        
        // Test database connection
        db.collection("test").doc("connection")
            .set({
                timestamp: new Date().toISOString(),
                connectionTest: true
            })
            .then(() => {
                console.log("Database write successful");
                if (debugElement) {
                    debugElement.innerHTML += '<div style="color:green">✓ Firebase Firestore connection successful</div>';
                }
            })
            .catch((error) => {
                console.error("Database write error:", error);
                if (debugElement) {
                    debugElement.innerHTML += `<div style="color:red">✗ Firebase Firestore error: ${error.message}</div>`;
                }
            });
            
        return {app, auth, db};
    } catch (error) {
        console.error("Firebase initialization error:", error);
        if (debugElement) {
            debugElement.innerHTML += `<div style="color:red">✗ Firebase initialization error: ${error.message}</div>`;
        }
        return null;
    }
}

// Helper function to ensure user status is always displayed
function updateUserStatus(user, ip) {
    const userStatusBanner = document.getElementById('userStatusBanner');
    if (!userStatusBanner) {
        console.error("User status banner element not found");
        return;
    }
    
    let statusText = '';
    
    // Add IP address if available
    if (ip && ip !== 'unknown') {
        statusText += `IP: ${ip} | `;
    } else {
        statusText += `IP: Retrieving... | `;
    }
    
    // Add login status
    if (user) {
        statusText += `Logged in as: ${user.email}`;
    } else {
        statusText += 'Not logged in';
    }
    
    userStatusBanner.textContent = statusText;
    userStatusBanner.style.display = 'block'; // Explicitly make visible
    
    console.log("Updated user status banner:", statusText);
}

// Fetch IP from our server endpoint
async function getIpFromServer() {
    try {
        const response = await fetch('/get-ip');
        const data = await response.json();
        console.log("IP from server:", data.ip);
        return data.ip;
    } catch (error) {
        console.error("Error fetching IP from server:", error);
        return "unknown";
    }
}
