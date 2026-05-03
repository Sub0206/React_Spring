package tech.skyno.lendiq.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tech.skyno.lendiq.auth.JwtService;

import java.io.IOException;

/**
 * Minimal JWT gate. Rather than pulling in Spring Security for a scaffold, we
 * parse the Authorization header ourselves and stash the resolved user_id on
 * the request attribute {@code userId} when the token is valid.
 *
 * <p>Controllers then simply read {@code (String) request.getAttribute("userId")}
 * to enforce auth. Unauthenticated requests to protected controllers produce
 * a 401 via the controller's own null-check, keeping the control flow
 * obvious and debuggable.</p>
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwt;

    public JwtAuthenticationFilter(JwtService jwt) {
        this.jwt = jwt;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req,
                                    HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        String auth = req.getHeader("Authorization");
        if (auth != null && auth.startsWith("Bearer ")) {
            try {
                String uid = jwt.extractSubject(auth.substring(7));
                if (uid != null) req.setAttribute("userId", uid);
            } catch (Exception ignored) {
                // Invalid or expired token — leave userId unset and let the controller
                // decide whether the endpoint requires auth.
            }
        }
        chain.doFilter(req, res);
    }
}
