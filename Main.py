from flask import Flask, render_template, request, jsonify, session
import requests
import uuid
import os
import json
import datetime
from functools import wraps

app = Flask(__name__)
app.secret_key = 'mw25-analytics-tracking-key'  # Used for session management

# Create logs directory if it doesn't exist
if not os.path.exists('logs'):
    os.makedirs('logs')

ANALYTICS_LOG_FILE = os.path.join('logs', 'user_analytics.log')

# Helper function to get client IP address
def get_client_ip():
    try:
        # First try to get client IP from request
        if request.environ.get('HTTP_X_FORWARDED_FOR'):
            return request.environ.get('HTTP_X_FORWARDED_FOR').split(',')[0]
        return request.environ.get('REMOTE_ADDR', 'unknown')
    except Exception as e:
        print(f"Error getting client IP: {e}")
        return 'unknown'

# Get geolocation data from IP
def get_geolocation(ip):
    try:
        if ip == 'unknown' or ip == '127.0.0.1':
            return {
                "country": "Unknown",
                "region": "Unknown",
                "city": "Unknown",
                "latitude": 0,
                "longitude": 0
            }
        # Free IP geolocation API - consider upgrading to a paid service for production
        response = requests.get(f'https://ipapi.co/{ip}/json/', timeout=5)
        if response.status_code == 200:
            data = response.json()
            return {
                "country": data.get('country_name', 'Unknown'),
                "region": data.get('region', 'Unknown'),
                "city": data.get('city', 'Unknown'),
                "latitude": data.get('latitude', 0),
                "longitude": data.get('longitude', 0)
            }
    except Exception as e:
        print(f"Geolocation error: {e}")
    
    return {
        "country": "Unknown",
        "region": "Unknown",
        "city": "Unknown",
        "latitude": 0,
        "longitude": 0
    }

# Session tracking decorator
def track_session(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Generate or retrieve session ID
        if 'session_id' not in session:
            session['session_id'] = str(uuid.uuid4())
            session['first_visit'] = datetime.datetime.now().isoformat()
        
        # Get user info
        client_ip = get_client_ip()
        user_agent = request.headers.get('User-Agent', 'Unknown')
        referrer = request.referrer or 'Direct'
        path = request.path
        
        # Log the pageview
        log_user_activity({
            'event_type': 'pageview',
            'session_id': session['session_id'],
            'ip': client_ip,
            'user_agent': user_agent,
            'referrer': referrer,
            'path': path,
            'timestamp': datetime.datetime.now().isoformat()
        })
        
        return f(*args, **kwargs)
    return decorated_function

# Log user activity to file and/or database
def log_user_activity(data):
    # Add timestamp if not present
    if 'timestamp' not in data:
        data['timestamp'] = datetime.datetime.now().isoformat()
    
    # Write to log file
    with open(ANALYTICS_LOG_FILE, 'a') as f:
        f.write(json.dumps(data) + '\n')
    
    # In production, you would also write to a database here
    # For example: firebase_db.collection('user_logs').add(data)
    
    print(f"Logged event: {data['event_type']}")

@app.route("/", methods=["GET"])
@track_session
def index():
    client_ip = get_client_ip()
    geo_data = get_geolocation(client_ip)
    
    return render_template(
        "index.html", 
        client_ip=client_ip,
        geo_data=geo_data,
        session_id=session.get('session_id', 'unknown')
    )

@app.route("/mw", methods=["GET"])
@track_session
def mw():
    client_ip = get_client_ip()
    geo_data = get_geolocation(client_ip)
    
    # Log search parameters if present
    search_query = request.args.get('query')
    if search_query:
        log_user_activity({
            'event_type': 'search',
            'session_id': session.get('session_id', 'unknown'),
            'ip': client_ip,
            'search_query': search_query,
            'search_type': request.args.get('searchType', 'unspecified'),
            'category': request.args.get('category', ''),
            'rating': request.args.get('rating', ''),
            'radius': request.args.get('radius', '')
        })
    
    return render_template(
        "mw.html", 
        client_ip=client_ip,
        geo_data=geo_data,
        session_id=session.get('session_id', 'unknown')
    )

@app.route("/get-ip", methods=["GET"])
def get_ip():
    try:
        client_ip = get_client_ip()
        geo_data = get_geolocation(client_ip)
        
        return jsonify({
            "ip": client_ip,
            "geo": geo_data,
            "session_id": session.get('session_id', 'unknown')
        })
    except Exception as e:
        print(f"Error in get_ip: {e}")
        return jsonify({"ip": "unknown", "error": str(e)})

# New endpoint to log client-side events
@app.route("/log-event", methods=["POST"])
def log_event():
    try:
        data = request.json
        client_ip = get_client_ip()
        
        # Add session and IP data
        data['session_id'] = session.get('session_id', 'unknown')
        data['ip'] = client_ip
        
        # Log the event
        log_user_activity(data)
        
        return jsonify({"success": True})
    except Exception as e:
        print(f"Error logging event: {e}")
        return jsonify({"success": False, "error": str(e)})

@app.route("/analytics", methods=["GET"])
@track_session
def analytics_dashboard():
    client_ip = get_client_ip()
    geo_data = get_geolocation(client_ip)
    
    return render_template(
        "analytics.html",
        client_ip=client_ip,
        geo_data=geo_data,
        session_id=session.get('session_id', 'unknown')
    )

@app.route("/admin/analytics-data", methods=["POST"])
def get_analytics_data():
    # This would be protected by authentication in production
    try:
        data = request.json
        start_date = data.get('startDate')
        end_date = data.get('endDate')
        
        # In a real implementation, you'd query your database here
        # For now, we'll return sample data
        return jsonify({
            "success": True,
            "data": {
                "visitors": {
                    "total": 256,
                    "unique": 187,
                    "registered": 42,
                    "pageviews": 1243
                },
                "countries": {
                    "United States": 120,
                    "Canada": 45,
                    "United Kingdom": 32,
                    "Australia": 18,
                    "Germany": 15,
                    "Other": 26
                },
                "searches": [
                    {"term": "restaurants near me", "count": 45, "type": "Business"},
                    {"term": "coffee shops", "count": 32, "type": "Business"},
                    {"term": "New York", "count": 28, "type": "Location"},
                    {"term": "hotels", "count": 24, "type": "Business"},
                    {"term": "California", "count": 19, "type": "State"}
                ]
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/get_user_ip", methods=["GET"])
def get_user_ip():
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    client_ip = client_ip.split(',')[0].strip() if client_ip else request.remote_addr
    
    # Get geolocation data
    geo_data = get_geolocation(client_ip)
    
    return jsonify({
        "ip": client_ip,
        "geo": geo_data,
        "timestamp": datetime.datetime.now().isoformat()
    })

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)