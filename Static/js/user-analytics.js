/**
 * User Analytics Tracking System
 * Tracks user behavior and stores data in Firebase
 */

class UserAnalytics {
    constructor() {
        this.sessionStartTime = new Date();
        this.sessionId = Math.random().toString(36).substring(2, 15);
        
        this.userProfile = {
            ip: null,
            location: {
                country: null,
                city: null,
                region: null,
                latitude: null,
                longitude: null
            },
            device: this.getDeviceInfo(),
            browser: this.getBrowserInfo(),
            firstSeen: new Date(),
            returning: false
        };
        
        this.sessionData = {
            pageViews: 0,
            startTime: this.sessionStartTime,
            searches: [],
            interactions: [],
            casinoPreferences: {
                viewed: {},
                clicked: {},
                amenitiesSelected: {},
                typePreference: null
            }
        };
        
        this.isAuthenticated = false;
        this.userId = null;
        this.userEmail = null;
        
        console.log("Initializing user analytics...");
        this.initialize();
    }
    
    async initialize() {
        try {
            // Get user IP and geolocation
            const response = await fetch('/get_user_ip');
            const data = await response.json();
            
            this.userProfile.ip = data.ip;
            this.userProfile.location = data.geo;
            
            // Check if this is a returning user
            await this.checkReturningUser();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Log initial page view
            this.logPageView();
            
            // Check for auth state changes
            document.addEventListener('auth_state_changed', this.handleAuthChange.bind(this));
            
            console.log("User profile initialized:", this.userProfile);
        } catch (error) {
            console.error("Failed to initialize analytics:", error);
        }
    }
    
    async checkReturningUser() {
        if (!firebase || !firebase.firestore) {
            console.warn("Firebase not available for user check");
            return;
        }
        
        try {
            const db = firebase.firestore();
            
            if (this.userProfile.ip) {
                const userDoc = await db.collection('users_by_ip')
                    .doc(this.userProfile.ip)
                    .get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    this.userProfile.returning = true;
                    this.previousVisits = userData.visitCount || 0;
                    
                    // Update visit count
                    await db.collection('users_by_ip').doc(this.userProfile.ip).update({
                        visitCount: firebase.firestore.FieldValue.increment(1),
                        lastVisit: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    // Load historical preferences
                    if (userData.preferences) {
                        this.sessionData.casinoPreferences.typePreference = 
                            userData.preferences.mostViewedType || null;
                    }
                    
                    console.log("Returning user detected:", {
                        previousVisits: this.previousVisits,
                        firstSeen: userData.firstSeen?.toDate()
                    });
                } else {
                    // First time user - create record
                    await db.collection('users_by_ip').doc(this.userProfile.ip).set({
                        firstSeen: firebase.firestore.FieldValue.serverTimestamp(),
                        lastVisit: firebase.firestore.FieldValue.serverTimestamp(),
                        visitCount: 1,
                        userAgent: navigator.userAgent,
                        device: this.userProfile.device,
                        preferences: {}
                    });
                }
            }
        } catch (error) {
            console.error("Error checking returning user status:", error);
        }
    }
    
    handleAuthChange(event) {
        if (event.detail && event.detail.user) {
            this.isAuthenticated = true;
            this.userId = event.detail.user.uid;
            this.userEmail = event.detail.user.email;
            
            this.logEvent('user_login', {
                user_id: this.userId,
                user_email: this.userEmail
            });
            
            // Link user auth with IP-based data
            this.linkUserWithIP();
        } else {
            this.isAuthenticated = false;
            this.userId = null;
            this.userEmail = null;
            
            this.logEvent('user_logout');
        }
    }
    
    async linkUserWithIP() {
        if (!firebase || !firebase.firestore || !this.userId || !this.userProfile.ip) return;
        
        try {
            const db = firebase.firestore();
            
            // Link IP with user ID
            await db.collection('user_mappings').doc(this.userId).set({
                linkedIPs: firebase.firestore.FieldValue.arrayUnion(this.userProfile.ip),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            // Update IP record with user ID
            await db.collection('users_by_ip').doc(this.userProfile.ip).update({
                linkedUsers: firebase.firestore.FieldValue.arrayUnion(this.userId),
                lastUserId: this.userId,
                lastUserEmail: this.userEmail
            });
            
            console.log("Successfully linked user with IP");
        } catch (error) {
            console.error("Error linking user with IP:", error);
        }
    }
    
    setupEventListeners() {
        // Track casino category selections
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', () => {
                const category = card.getAttribute('data-category');
                this.logCasinoPreference('category', category);
            });
        });
        
        // Track filter selections
        document.querySelectorAll('.filter-item').forEach(item => {
            item.addEventListener('click', () => {
                if (item.hasAttribute('data-amenity')) {
                    const amenity = item.getAttribute('data-amenity');
                    this.logCasinoPreference('amenity', amenity);
                }
                
                if (item.hasAttribute('data-rating')) {
                    const rating = item.getAttribute('data-rating');
                    this.logCasinoPreference('rating', rating);
                }
                
                if (item.hasAttribute('data-distance')) {
                    const distance = item.getAttribute('data-distance');
                    this.logCasinoPreference('distance', distance);
                }
            });
        });
        
        // Track search submissions
        const searchForm = document.getElementById('searchForm');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                const searchInput = document.getElementById('searchInput');
                if (searchInput && searchInput.value) {
                    this.logSearch(searchInput.value);
                }
            });
        }
    }
    
    logPageView() {
        this.sessionData.pageViews++;
        const page = window.location.pathname;
        
        this.logEvent('page_view', {
            page: page,
            title: document.title,
            referrer: document.referrer,
            loadTime: performance.now()
        });
    }
    
    logSearch(query, filters = {}) {
        // Add to searches array
        this.sessionData.searches.push({
            query: query,
            filters: filters,
            timestamp: new Date()
        });
        
        this.logEvent('search', {
            query: query,
            ...filters
        });
    }
    
    logCasinoPreference(type, value) {
        // Track casino preference by type
        switch (type) {
            case 'category':
                if (!this.sessionData.casinoPreferences.viewed[value]) {
                    this.sessionData.casinoPreferences.viewed[value] = 0;
                }
                this.sessionData.casinoPreferences.viewed[value]++;
                this.sessionData.casinoPreferences.typePreference = this.getMostFrequent(this.sessionData.casinoPreferences.viewed);
                break;
            case 'click':
                if (!this.sessionData.casinoPreferences.clicked[value]) {
                    this.sessionData.casinoPreferences.clicked[value] = 0;
                }
                this.sessionData.casinoPreferences.clicked[value]++;
                break;
            case 'amenity':
                if (!this.sessionData.casinoPreferences.amenitiesSelected[value]) {
                    this.sessionData.casinoPreferences.amenitiesSelected[value] = 0;
                }
                this.sessionData.casinoPreferences.amenitiesSelected[value]++;
                break;
        }
        
        this.logEvent('casino_preference', {
            preferenceType: type,
            value: value,
            count: this.sessionData.casinoPreferences.viewed[value] || 1
        });
        
        // Update Firebase with preference data
        this.updatePreferencesInFirebase(type, value);
    }
    
    async updatePreferencesInFirebase(type, value) {
        if (!firebase || !firebase.firestore || !this.userProfile.ip) return;
        
        try {
            const db = firebase.firestore();
            const userDocRef = db.collection('users_by_ip').doc(this.userProfile.ip);
            
            // Build update object based on preference type
            let updateObj = {};
            
            switch (type) {
                case 'category':
                    updateObj[`preferences.categories.${value}`] = firebase.firestore.FieldValue.increment(1);
                    updateObj[`preferences.mostViewedType`] = this.sessionData.casinoPreferences.typePreference;
                    break;
                case 'amenity':
                    updateObj[`preferences.amenities.${value}`] = firebase.firestore.FieldValue.increment(1);
                    break;
                case 'rating':
                    updateObj[`preferences.ratingPreference`] = value;
                    break;
                case 'distance':
                    updateObj[`preferences.distancePreference`] = value;
                    break;
                case 'click':
                    updateObj[`preferences.clicked.${value}`] = firebase.firestore.FieldValue.increment(1);
                    break;
            }
            
            await userDocRef.update(updateObj);
            
            // Also log detailed event in user_events subcollection
            await userDocRef.collection('user_events').add({
                eventType: 'preference',
                preferenceType: type,
                value: value,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                sessionId: this.sessionId
            });
            
        } catch (error) {
            console.error("Error updating preferences in Firebase:", error);
        }
    }
    
    getMostFrequent(obj) {
        let max = 0;
        let maxKey = null;
        
        for (let key in obj) {
            if (obj[key] > max) {
                max = obj[key];
                maxKey = key;
            }
        }
        
        return maxKey;
    }
    
    logEvent(event_type, details = {}) {
        // Add user and session info
        const eventData = {
            timestamp: new Date(),
            sessionId: this.sessionId,
            sessionDuration: Math.floor((new Date() - this.sessionStartTime) / 1000),
            ip: this.userProfile.ip,
            location: this.userProfile.location,
            device: this.userProfile.device,
            browser: this.userProfile.browser,
            user_id: this.userId,
            user_email: this.userEmail,
            isAuthenticated: this.isAuthenticated,
            returning: this.userProfile.returning,
            previousVisits: this.previousVisits || 0,
            ...details
        };
        
        // Add to interactions array
        this.sessionData.interactions.push({
            type: event_type,
            details: details,
            timestamp: new Date()
        });
        
        console.log(`Analytics event: ${event_type}`, eventData);
        
        // Send to Firebase if available
        if (firebase && firebase.firestore && this.userProfile.ip) {
            try {
                const db = firebase.firestore();
                
                // Log in users_by_ip collection
                db.collection('users_by_ip')
                  .doc(this.userProfile.ip)
                  .collection('sessions')
                  .doc(this.sessionId)
                  .collection('events')
                  .add({
                      eventType: event_type,
                      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                      ...details
                  });
                
                // Update session summary
                db.collection('users_by_ip')
                  .doc(this.userProfile.ip)
                  .collection('sessions')
                  .doc(this.sessionId)
                  .set({
                      startTime: firebase.firestore.Timestamp.fromDate(this.sessionStartTime),
                      lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
                      pageViews: this.sessionData.pageViews,
                      duration: Math.floor((new Date() - this.sessionStartTime) / 1000),
                      userAgent: navigator.userAgent,
                      device: this.userProfile.device,
                      searches: this.sessionData.searches.length,
                      interactions: this.sessionData.interactions.length
                  }, { merge: true });
                
            } catch (e) {
                console.warn("Firebase logging error:", e);
            }
        }
        
        // If Firebase Analytics is available, log there too
        if (firebase && firebase.analytics) {
            try {
                firebase.analytics().logEvent(event_type, eventData);
            } catch (e) {
                console.warn("Analytics logging error:", e);
            }
        }
    }
    
    getDeviceInfo() {
        const ua = navigator.userAgent;
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
            return 'mobile';
        } else if (/iPad|Tablet|PlayBook/i.test(ua)) {
            return 'tablet';
        }
        return 'desktop';
    }
    
    getBrowserInfo() {
        const ua = navigator.userAgent;
        if (ua.indexOf("Chrome") > -1) return "Chrome";
        if (ua.indexOf("Safari") > -1) return "Safari";
        if (ua.indexOf("Firefox") > -1) return "Firefox";
        if (ua.indexOf("MSIE") > -1 || ua.indexOf("Trident") > -1) return "IE";
        if (ua.indexOf("Edge") > -1) return "Edge";
        return "Unknown";
    }
    
    // Generate summary of user behavior
    getUserInsights() {
        return {
            profile: {
                isNewUser: !this.userProfile.returning,
                visits: this.previousVisits + 1,
                location: this.userProfile.location
            },
            behavior: {
                sessionDuration: Math.floor((new Date() - this.sessionStartTime) / 1000),
                pageViews: this.sessionData.pageViews,
                searchCount: this.sessionData.searches.length,
                mainInterests: this.getTopInterests(),
                primaryCasinoType: this.sessionData.casinoPreferences.typePreference
            },
            preferences: {
                casinoTypes: this.sessionData.casinoPreferences.viewed,
                amenities: this.sessionData.casinoPreferences.amenitiesSelected
            }
        };
    }
    
    getTopInterests() {
        // Extract interests from interactions
        const interests = {};
        
        // Look at casino preferences
        for (const type in this.sessionData.casinoPreferences.viewed) {
            interests[type] = this.sessionData.casinoPreferences.viewed[type];
        }
        
        // Sort by frequency
        return Object.entries(interests)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(entry => entry[0]);
    }

    async createPost(text, videoFile) {
        if (!firebase || !firebase.firestore || !firebase.storage) {
            console.error("Firebase not initialized.");
            return;
        }

        try {
            const db = firebase.firestore();
            const storage = firebase.storage();
            const userId = this.userId || "anonymous";

            // Upload video if provided
            let videoUrl = null;
            if (videoFile) {
                const videoRef = storage.ref(`posts/${userId}/${Date.now()}_${videoFile.name}`);
                const snapshot = await videoRef.put(videoFile);
                videoUrl = await snapshot.ref.getDownloadURL();
            }

            // Save post to Firestore
            const post = {
                userId,
                username: this.userProfile.username || "Anonymous",
                text,
                videoUrl,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            };

            await db.collection("posts").add(post);
            console.log("Post created:", post);

            // Reload posts
            this.loadPosts();
        } catch (error) {
            console.error("Error creating post:", error);
        }
    }

    async loadPosts() {
        if (!firebase || !firebase.firestore) {
            console.error("Firebase not initialized.");
            return;
        }

        try {
            const db = firebase.firestore();
            const postsContainer = document.getElementById("postsContainer");
            postsContainer.innerHTML = ""; // Clear existing posts

            const querySnapshot = await db.collection("posts").orderBy("timestamp", "desc").get();
            querySnapshot.forEach((doc, index) => {
                const post = doc.data();
                const postElement = this.createPostElement(post);

                // Insert ad after every 5 posts
                if (index > 0 && index % 5 === 0) {
                    const adElement = this.createAdElement();
                    postsContainer.appendChild(adElement);
                }

                postsContainer.appendChild(postElement);
            });
        } catch (error) {
            console.error("Error loading posts:", error);
        }
    }

    createPostElement(post) {
        const postDiv = document.createElement("div");
        postDiv.className = "post";

        const usernameDiv = document.createElement("div");
        usernameDiv.className = "post-username";
        usernameDiv.textContent = post.username;

        const textDiv = document.createElement("div");
        textDiv.className = "post-text";
        textDiv.textContent = post.text;

        postDiv.appendChild(usernameDiv);
        postDiv.appendChild(textDiv);

        if (post.videoUrl) {
            const video = document.createElement("video");
            video.src = post.videoUrl;
            video.controls = true;
            video.style.maxWidth = "100%";
            postDiv.appendChild(video);
        }

        return postDiv;
    }

    createAdElement() {
        const adDiv = document.createElement("div");
        adDiv.className = "ad";
        adDiv.textContent = "Your Ad Here!";
        adDiv.style.background = "#f0f0f0";
        adDiv.style.padding = "10px";
        adDiv.style.textAlign = "center";
        return adDiv;
    }
}

// Initialize analytics when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.userAnalytics = new UserAnalytics();
});

// Helper function for tracking events globally
function trackEvent(eventName, details = {}) {
    if (window.userAnalytics) {
        window.userAnalytics.logEvent(eventName, details);
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UserAnalytics, trackEvent };
}

// Initialize analytics and set up post functionality
document.addEventListener("DOMContentLoaded", () => {
    const analytics = new UserAnalytics();

    const submitPostBtn = document.getElementById("submitPostBtn");
    if (submitPostBtn) {
        submitPostBtn.addEventListener("click", async () => {
            const postText = document.getElementById("postText").value;
            const postVideo = document.getElementById("postVideo").files[0];
            await analytics.createPost(postText, postVideo);
        });
    }

    // Load posts on page load
    analytics.loadPosts();
});
