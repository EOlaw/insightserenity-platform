/**
 * @fileoverview GitHub API Integration
 */

class GitHubAPI {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseUrl = 'https://api.github.com';
        this.headers = {
            'Authorization': `token ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json'
        };
    }
    
    async getUser() {
        try {
            const response = await fetch(`${this.baseUrl}/user`, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            throw new Error(`GitHub API error: ${error.message}`);
        }
    }
    
    async getRepos(username = null) {
        const url = username 
            ? `${this.baseUrl}/users/${username}/repos`
            : `${this.baseUrl}/user/repos`;
            
        try {
            const response = await fetch(url, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            throw new Error(`GitHub API error: ${error.message}`);
        }
    }
    
    async createRepo(name, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/user/repos`, {
                method: 'POST',
                headers: {
                    ...this.headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    private: options.private || false,
                    description: options.description,
                    ...options
                })
            });
            return await response.json();
        } catch (error) {
            throw new Error(`GitHub API error: ${error.message}`);
        }
    }
    
    async getGists() {
        try {
            const response = await fetch(`${this.baseUrl}/gists`, {
                headers: this.headers
            });
            return await response.json();
        } catch (error) {
            throw new Error(`GitHub API error: ${error.message}`);
        }
    }
}

module.exports = GitHubAPI;
