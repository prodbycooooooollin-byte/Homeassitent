// Beispiel-gameinfo (gekürzt, Testfixture)
GameInfo
{
    game        "citadel"
    title       "Citadel"
    FileSystem
    {
        SearchPaths
        {
            Game_Language       citadel_*LANGUAGE*
            Mod                 citadel
            Write               citadel
            Game                citadel
            Mod                 core
            Write               core
            Game                core
        }
    }
    ConVars
    {
        // Kommentar im ConVars-Block
        rate
        {
            min     "98304"
            default "786432"
            max     "1000000"
        }
        r_citadel_npr_outlines_max_dist "1000"
    }
}
