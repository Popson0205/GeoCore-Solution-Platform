# Live Testing Checklist

- [ ] Backend starts without errors
- [ ] Frontend builds successfully
- [ ] `/api/health` returns success
- [ ] Public Railway domain is active
- [ ] Custom domain is connected
- [ ] SSL is active
- [ ] Environment variables are set (`DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`)
- [ ] Database is connected and tables are created on startup
- [ ] A new user can register at `/api/auth/register`
- [ ] That user can log in and receive a token at `/api/auth/login`
- [ ] `/api/auth/me` returns the logged-in user with a valid token
- [ ] The user can create an organisation and appears as its owner
- [ ] The user can create a project inside that organisation
- [ ] A user who is not a member of an organisation is rejected (403) from its projects
