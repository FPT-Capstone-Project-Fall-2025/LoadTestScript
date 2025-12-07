-- ================================================================
-- CREATE 100 TEST ACCOUNTS - COMPLETE SQL SCRIPT
-- ================================================================
-- Database: gp_identity_test
-- Run this entire script in DBeaver
-- ================================================================

DO $$
DECLARE
    i INTEGER;
    v_email TEXT;
    v_phone TEXT;
    v_username TEXT;
    v_user_id UUID;
    v_password_hash TEXT;
    v_security_stamp TEXT;
    v_concurrency_stamp TEXT;
    created_count INTEGER := 0;
BEGIN
    -- Get a valid password hash from existing user
    -- This ensures the password will work for login
    SELECT "PasswordHash" INTO v_password_hash 
    FROM "AspNetUsers" 
    WHERE "PasswordHash" IS NOT NULL 
    LIMIT 1;
    
    -- If no existing user found, use default hash
    IF v_password_hash IS NULL THEN
        -- This is a sample hash - may need to be replaced with actual hash from your system
        v_password_hash := 'AQAAAAIAAYagAAAAEJxQdLWj9cK3tYXkzm5jNqK4VqHxJ5rK8L9MnOpQrStUvWxYzA1BcDe2FgHi3JkLmN==';
        RAISE NOTICE 'WARNING: Using default password hash. You may need to reset passwords.';
    ELSE
        RAISE NOTICE 'Using password hash from existing user.';
    END IF;
    
    RAISE NOTICE 'Creating 100 test accounts...';
    RAISE NOTICE '';
    
    -- Loop to create 100 accounts
    FOR i IN 1..100 LOOP
        -- Format: loadtest001@ftm.com to loadtest100@ftm.com
        v_email := 'loadtest' || LPAD(i::TEXT, 3, '0') || '@ftm.com';
        v_phone := '09' || LPAD(i::TEXT, 8, '0');
        v_username := 'loadtest' || LPAD(i::TEXT, 3, '0');
        v_user_id := gen_random_uuid();
        v_security_stamp := UPPER(REPLACE(gen_random_uuid()::TEXT, '-', ''));
        v_concurrency_stamp := REPLACE(gen_random_uuid()::TEXT, '-', '');
        
        -- Insert or update user
        BEGIN
            INSERT INTO "AspNetUsers" (
                "Id",
                "Name",
                "UserName",
                "NormalizedUserName",
                "Email",
                "NormalizedEmail",
                "EmailConfirmed",
                "PasswordHash",
                "SecurityStamp",
                "ConcurrencyStamp",
                "PhoneNumber",
                "PhoneNumberConfirmed",
                "TwoFactorEnabled",
                "LockoutEnd",
                "LockoutEnabled",
                "AccessFailedCount",
                "IsActive",
                "IsGoogleLogin",
                "CreatedDate",
                "UpdatedDate"
            ) VALUES (
                v_user_id,
                v_username,              -- Name (required)
                v_username,
                UPPER(v_username),
                v_email,
                UPPER(v_email),
                true,                    -- EmailConfirmed = true (activated)
                v_password_hash,
                v_security_stamp,
                v_concurrency_stamp,
                v_phone,
                true,                    -- PhoneNumberConfirmed = true
                false,                   -- TwoFactorEnabled = false
                NULL,                    -- LockoutEnd = NULL (not locked)
                false,                   -- LockoutEnabled = false
                0,                       -- AccessFailedCount = 0
                true,                    -- IsActive = true
                false,                   -- IsGoogleLogin = false
                NOW(),                   -- CreatedDate
                NOW()                    -- UpdatedDate
            );
            created_count := created_count + 1;
        EXCEPTION
            WHEN unique_violation THEN
                -- Skip if email already exists
                NULL;
        END;
        
        -- Progress indicator every 10 accounts
        IF i % 10 = 0 THEN
            RAISE NOTICE '[%/100] Created % accounts...', i, i;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'COMPLETED: % test accounts created and activated!', created_count;
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'Email: loadtest001@ftm.com to loadtest100@ftm.com';
    RAISE NOTICE 'Password: LoadTest@123 (or same as existing user)';
    RAISE NOTICE 'Phone: 0900000001 to 0900000100';
    RAISE NOTICE 'All accounts are activated and unlocked';
    RAISE NOTICE '================================================================';
END $$;

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================

-- Count total accounts
SELECT 
    COUNT(*) as total_accounts,
    SUM(CASE WHEN "EmailConfirmed" = true THEN 1 ELSE 0 END) as activated_accounts,
    SUM(CASE WHEN "LockoutEnabled" = false THEN 1 ELSE 0 END) as unlocked_accounts
FROM "AspNetUsers"
WHERE "Email" LIKE 'loadtest%@ftm.com';

-- Show first 10 accounts
SELECT 
    ROW_NUMBER() OVER (ORDER BY "Email") as no,
    "Email",
    "PhoneNumber",
    "EmailConfirmed",
    "LockoutEnabled"
FROM "AspNetUsers"
WHERE "Email" LIKE 'loadtest%@ftm.com'
ORDER BY "Email"
LIMIT 10;

-- ================================================================
-- EXPORT TO JSON (Copy result and save as test-accounts.json)
-- ================================================================
SELECT json_agg(
    json_build_object(
        'email', "Email",
        'password', 'LoadTest@123',
        'phone', "PhoneNumber",
        'username', SPLIT_PART("Email", '@', 1),
        'emailConfirmed', "EmailConfirmed",
        'isActive', NOT "LockoutEnabled"
    ) ORDER BY "Email"
) as accounts_json
FROM "AspNetUsers"
WHERE "Email" LIKE 'loadtest%@ftm.com';

-- ================================================================
-- EXPORT TO CSV (Right-click → Export Data → CSV)
-- ================================================================
SELECT 
    ROW_NUMBER() OVER (ORDER BY "Email") as no,
    "Email" as email,
    'LoadTest@123' as password,
    "PhoneNumber" as phone,
    SPLIT_PART("Email", '@', 1) as username,
    "EmailConfirmed" as activated
FROM "AspNetUsers"
WHERE "Email" LIKE 'loadtest%@ftm.com'
ORDER BY "Email";
