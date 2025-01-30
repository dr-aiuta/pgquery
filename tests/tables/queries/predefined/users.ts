export default {
	selectUserDetails: `
        WITH user_posts AS (
            SELECT 
                p.*,
                u.name as "authorName"
            FROM posts p
            JOIN users u ON p."userId" = u.id
        ),
        posts_agg AS (
            SELECT 
                p."userId",
                json_agg(
                    json_build_object(
                        'id', p.id,
                        'title', p.title,
                        'content', p.content,
                        'createdAt', p."createdAt",
                        'authorName', p."authorName"
                    )
                ) as posts
            FROM user_posts p
            GROUP BY p."userId"
        ),
        addresses_agg AS (
            SELECT 
                a."userId",
                json_agg(
                    json_build_object(
                        'id', a.id,
                        'street', a.street,
                        'neighborhood', a.neighborhood,
                        'city', a.city,
                        'userId', a."userId"
                    )
                ) as addresses
            FROM addresses a
            GROUP BY a."userId"
        )
        SELECT 
            u.id,
            u.name,
            u.email,
            pa.posts,
            aa.addresses
        FROM users u
        LEFT JOIN posts_agg pa ON u.id = pa."userId"
        LEFT JOIN addresses_agg aa ON u.id = aa."userId"
        WHERE 1=1
    `,
};
